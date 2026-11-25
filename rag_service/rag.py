"""Core retrieval-augmented generation logic.

Pipeline: PDF -> page text -> sentence-aware chunks -> embeddings in ChromaDB.
Questions are answered with hybrid retrieval (vector search + BM25 keyword
search, merged with reciprocal rank fusion), a relevance check, and a local
Ollama model that is told to answer only from the numbered sources.
"""

import json
import math
import os
import re
import threading
import uuid
from collections import Counter

import requests
from pypdf import PdfReader

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "llama3.2")
EMBED_MODEL = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")
CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")
NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "4096"))

TOP_K = int(os.getenv("TOP_K", "5"))  # passages given to the model
CANDIDATES = int(os.getenv("CANDIDATES", "20"))  # passages fetched by each retriever
MAX_DISTANCE = float(os.getenv("MAX_DISTANCE", "0.75"))  # cosine distance: lower is closer
BM25_MIN_COVERAGE = float(os.getenv("BM25_MIN_COVERAGE", "0.6"))  # share of question terms a keyword match must contain

DOMAINS = {"interior", "exterior", "structural", "general"}
NOT_FOUND = (
    "I couldn't find that in the project documents. "
    "Try rephrasing, choose a different document type, or upload the relevant file."
)

SYSTEM_PROMPT = (
    "You are a construction and design assistant for interior and exterior projects. "
    "Answer using ONLY the numbered sources provided. After each fact, cite the source "
    "it came from like [S1]. If the sources do not contain the answer, say so plainly "
    "and do not guess. Never invent prices, dimensions, quantities or material "
    "specifications. Be concise, and use short bullet points for lists of specifications."
)


class OllamaError(Exception):
    """Raised with a message that is safe to show to the person using the app."""


# --------------------------------------------------------------------------- #
# Embeddings and vector store (both created lazily)
# --------------------------------------------------------------------------- #

_embedder = None
_embedder_lock = threading.Lock()
_collection = None
_collection_lock = threading.Lock()


def get_embedder():
    global _embedder
    if _embedder is None:
        with _embedder_lock:
            if _embedder is None:
                from sentence_transformers import SentenceTransformer

                _embedder = SentenceTransformer(EMBED_MODEL)
    return _embedder


def embed(texts):
    return get_embedder().encode(texts, normalize_embeddings=True).tolist()


def get_collection():
    global _collection
    if _collection is None:
        with _collection_lock:
            if _collection is None:
                import chromadb

                client = chromadb.PersistentClient(path=CHROMA_PATH)
                _collection = client.get_or_create_collection(
                    name="construction_docs", metadata={"hnsw:space": "cosine"}
                )
    return _collection


# --------------------------------------------------------------------------- #
# Ingestion
# --------------------------------------------------------------------------- #

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?;])\s+|\n{2,}")


def chunk_text(text, size=900, overlap=150):
    """Split text into chunks of about `size` characters on sentence boundaries,
    carrying roughly `overlap` characters into the next chunk for context."""
    text = re.sub(r"[ \t]+", " ", text or "")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []

    pieces = []
    for sentence in _SENTENCE_SPLIT.split(text):
        sentence = sentence.strip()
        while len(sentence) > size:  # a very long run with no punctuation
            pieces.append(sentence[:size])
            sentence = sentence[size - overlap:]
        if sentence:
            pieces.append(sentence)

    chunks, current = [], []

    def length(parts):
        return sum(len(p) for p in parts) + max(len(parts) - 1, 0)

    for piece in pieces:
        if current and length(current) + 1 + len(piece) > size:
            chunks.append(" ".join(current))
            carry = []
            for prev in reversed(current):
                if length(carry) + len(prev) > overlap:
                    break
                carry.insert(0, prev)
            current = carry
        current.append(piece)
    if current:
        chunks.append(" ".join(current))

    return [c for c in chunks if len(c.strip()) >= 40]


def extract_pages(path):
    reader = PdfReader(path)
    return [(i, page.extract_text() or "") for i, page in enumerate(reader.pages, start=1)]


def add_chunks(pages, doc_id, project_id, domain, title):
    """Index (page_number, text) pairs. Re-indexing the same doc_id replaces it."""
    remove_document(doc_id)
    ids, docs, metas = [], [], []
    for page_number, text in pages:
        for chunk in chunk_text(text):
            ids.append(str(uuid.uuid4()))
            docs.append(chunk)
            metas.append(
                {
                    "doc_id": doc_id,
                    "project_id": project_id,
                    "domain": domain if domain in DOMAINS else "general",
                    "page": page_number,
                    "title": title or "Document",
                }
            )
    collection = get_collection()
    for start in range(0, len(docs), 64):
        batch = slice(start, start + 64)
        collection.add(
            ids=ids[batch],
            documents=docs[batch],
            embeddings=embed(docs[batch]),
            metadatas=metas[batch],
        )
    invalidate(project_id)
    return len(docs)


def ingest_pdf(path, doc_id, project_id, domain, title):
    pages = extract_pages(path)
    chunks = add_chunks(pages, doc_id, project_id, domain, title)
    return {"pages": len(pages), "chunks": chunks}


def remove_document(doc_id):
    collection = get_collection()
    found = collection.get(where={"doc_id": doc_id}, include=["metadatas"])
    for meta in found.get("metadatas") or []:
        invalidate(meta.get("project_id"))
    collection.delete(where={"doc_id": doc_id})


# --------------------------------------------------------------------------- #
# Keyword search (BM25)
# --------------------------------------------------------------------------- #

_TOKEN = re.compile(r"[a-z0-9]+(?:[.\-/][a-z0-9]+)*")
_STOP = set(
    "a an and are as at be by for from has have how in is it its of on or that the this "
    "to was were what when where which who will with do does did can could should would "
    "about into than then there their them they these those you your i we our".split()
)


def tokenize(text):
    """Lower-case terms. Keeps clause numbers and codes like 3.2.1 or m-25 whole
    and also indexes their parts, which suits specification documents."""
    tokens = []
    for raw in _TOKEN.findall((text or "").lower()):
        if raw in _STOP:
            continue
        tokens.append(raw)
        if re.search(r"[.\-/]", raw):
            tokens.extend(p for p in re.split(r"[.\-/]", raw) if len(p) > 1 and p not in _STOP)
    return tokens


class ProjectIndex:
    """All chunks of one project, with BM25 statistics for keyword search."""

    def __init__(self, ids, docs, metas):
        self.ids, self.docs, self.metas = ids, docs, metas
        self.counts = [Counter(tokenize(d)) for d in docs]
        self.lengths = [sum(c.values()) for c in self.counts]
        self.n = len(docs)
        self.avgdl = (sum(self.lengths) / self.n) if self.n else 0.0
        self.df = Counter()
        for c in self.counts:
            self.df.update(c.keys())

    def scores(self, query, allowed=None, k1=1.5, b=0.75):
        terms = set(tokenize(query))
        out = []
        for i, counts in enumerate(self.counts):
            if allowed is not None and not allowed(self.metas[i]):
                continue
            score = 0.0
            for term in terms:
                tf = counts.get(term)
                if not tf:
                    continue
                idf = math.log((self.n - self.df[term] + 0.5) / (self.df[term] + 0.5) + 1)
                denom = tf + k1 * (1 - b + b * self.lengths[i] / (self.avgdl or 1))
                score += idf * tf * (k1 + 1) / denom
            if score > 0:
                matched = sum(1 for term in terms if counts.get(term))
                out.append((i, score, matched / len(terms)))
        out.sort(key=lambda row: row[1], reverse=True)
        return out


_indexes = {}
_indexes_lock = threading.Lock()


def invalidate(project_id):
    with _indexes_lock:
        _indexes.pop(project_id, None)


def get_index(project_id):
    with _indexes_lock:
        index = _indexes.get(project_id)
    if index is None:
        data = get_collection().get(where={"project_id": project_id}, include=["documents", "metadatas"])
        index = ProjectIndex(data["ids"], data["documents"] or [], data["metadatas"] or [])
        with _indexes_lock:
            _indexes[project_id] = index
    return index


# --------------------------------------------------------------------------- #
# Retrieval
# --------------------------------------------------------------------------- #

_INTERIOR = [
    "interior", "flooring", "floor finish", "tile", "ceiling", "paint", "furniture", "lighting",
    "finish", "cabinet", "wallpaper", "kitchen", "bathroom", "joinery", "wardrobe", "carpet",
]
_EXTERIOR = [
    "exterior", "facade", "façade", "cladding", "roof", "landscape", "weatherproof", "paving",
    "boundary", "elevation", "gate", "terrace", "balcony", "driveway", "fence", "external wall",
]


def detect_domain(question):
    """Guess interior/exterior from whole words in the question, or None if unclear."""
    q = (question or "").lower()

    def hits(words):
        return sum(1 for w in words if re.search(rf"\b{re.escape(w)}", q))

    interior, exterior = hits(_INTERIOR), hits(_EXTERIOR)
    if interior > exterior:
        return "interior"
    if exterior > interior:
        return "exterior"
    return None


def _domain_filter(domain):
    if not domain:
        return None
    allowed = {domain, "general"}
    return lambda meta: meta.get("domain") in allowed


def retrieve(question, project_id, domain=None, k=TOP_K):
    """Return up to k relevant chunks as dicts, best first. An empty list means
    nothing in the project is relevant enough to answer from."""
    index = get_index(project_id)
    if index.n == 0:
        return []
    allowed = _domain_filter(domain)

    where = {"project_id": project_id}
    if domain:
        where = {"$and": [where, {"domain": {"$in": [domain, "general"]}}]}
    vector = get_collection().query(
        query_embeddings=embed([question]),
        n_results=min(CANDIDATES, index.n),
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    candidates = {}  # chunk id -> dict
    for rank, (cid, text, meta, dist) in enumerate(
        zip(vector["ids"][0], vector["documents"][0], vector["metadatas"][0], vector["distances"][0])
    ):
        candidates[cid] = {"id": cid, "text": text, "meta": meta, "distance": dist, "vector_rank": rank}

    keyword = index.scores(question, allowed)[:CANDIDATES]
    for rank, (i, score, coverage) in enumerate(keyword):
        cid = index.ids[i]
        entry = candidates.setdefault(
            cid, {"id": cid, "text": index.docs[i], "meta": index.metas[i], "distance": None, "vector_rank": None}
        )
        entry["bm25_rank"], entry["bm25"], entry["coverage"] = rank, score, coverage

    # Reciprocal rank fusion: rewards chunks that rank well in either retriever.
    for entry in candidates.values():
        entry["rrf"] = sum(
            1.0 / (60 + entry[key]) for key in ("vector_rank", "bm25_rank") if entry.get(key) is not None
        )

    def relevant(entry):
        close = entry["distance"] is not None and entry["distance"] <= MAX_DISTANCE
        keyword_hit = entry.get("bm25_rank", 99) < 3 and entry.get("coverage", 0) >= BM25_MIN_COVERAGE
        return close or keyword_hit

    ranked = sorted((e for e in candidates.values() if relevant(e)), key=lambda e: e["rrf"], reverse=True)
    return ranked[:k]


# --------------------------------------------------------------------------- #
# Ollama
# --------------------------------------------------------------------------- #

def _ollama_error(response):
    try:
        detail = response.json().get("error", "")
    except ValueError:
        detail = ""
    if response.status_code == 404 and "not found" in detail.lower():
        return OllamaError(f"The model '{LLM_MODEL}' isn't installed. Run: ollama pull {LLM_MODEL}")
    return OllamaError(detail or f"Ollama returned an error ({response.status_code}).")


def _connection_error():
    return OllamaError(f"Can't reach Ollama at {OLLAMA_URL}. Start the Ollama app, then try again.")


def ollama_chat(messages, options=None):
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={"model": LLM_MODEL, "messages": messages, "stream": False, "options": options or {}},
            timeout=(5, 180),
        )
    except requests.RequestException as exc:
        raise _connection_error() from exc
    if response.status_code >= 400:
        raise _ollama_error(response)
    return response.json().get("message", {}).get("content", "")


def ollama_stream(messages):
    """Yield the model's answer piece by piece."""
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": LLM_MODEL,
                "messages": messages,
                "stream": True,
                "options": {"temperature": 0.2, "num_ctx": NUM_CTX},
            },
            stream=True,
            timeout=(5, 300),
        )
    except requests.RequestException as exc:
        raise _connection_error() from exc

    with response:
        if response.status_code >= 400:
            raise _ollama_error(response)
        try:
            for line in response.iter_lines():
                if not line:
                    continue
                data = json.loads(line)
                if data.get("error"):
                    raise OllamaError(data["error"])
                piece = data.get("message", {}).get("content", "")
                if piece:
                    yield piece
                if data.get("done"):
                    break
        except requests.RequestException as exc:
            raise OllamaError("The connection to Ollama dropped while answering.") from exc


def ollama_status():
    """Report whether Ollama is reachable and the chosen model is installed."""
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=2)
        names = [m.get("name", "") for m in response.json().get("models", [])]
    except (requests.RequestException, ValueError):
        return {"ollama": False, "model_installed": False}
    wanted = LLM_MODEL.split(":")[0]
    return {"ollama": True, "model_installed": any(n.split(":")[0] == wanted for n in names)}


# --------------------------------------------------------------------------- #
# Answering
# --------------------------------------------------------------------------- #

_FOLLOW_UP = re.compile(
    r"\b(it|its|that|this|those|these|them|they|their|there|same|also|above|previous|former|latter|one)\b", re.I
)
_CITATION = re.compile(r"\s*\[S\d+\]")


def _clean_history(history, limit=1200):
    turns = []
    for turn in history[-10:]:
        role, content = turn.get("role"), turn.get("content", "")
        if role in ("user", "assistant") and content:
            turns.append({"role": role, "content": _CITATION.sub("", content)[:limit]})
    return turns


def needs_rewrite(question, history):
    return bool(history) and (len(question.split()) <= 6 or bool(_FOLLOW_UP.search(question)))


def rewrite_question(question, history):
    """Turn a follow-up like 'what about its thickness?' into a standalone question."""
    turns = _clean_history(history)[-4:]
    conversation = "\n".join(f"{t['role']}: {t['content'][:400]}" for t in turns)
    prompt = (
        "Rewrite the latest question so it can be understood on its own, using the conversation "
        "for context. Reply with the rewritten question only.\n\n"
        f"{conversation}\nuser: {question}"
    )
    try:
        rewritten = ollama_chat([{"role": "user", "content": prompt}], {"temperature": 0, "num_predict": 80})
    except OllamaError:
        return question  # retrieval can still work with the original wording
    lines = (rewritten or "").strip().splitlines()
    rewritten = lines[0].strip().strip('"') if lines else ""
    return rewritten if 3 <= len(rewritten) <= 300 else question


def build_messages(question, hits, history):
    context = "\n\n".join(
        f"[S{i}] {h['meta'].get('title', 'Document')}, page {h['meta'].get('page')}\n{h['text']}"
        for i, h in enumerate(hits, start=1)
    )
    return (
        [{"role": "system", "content": SYSTEM_PROMPT}]
        + _clean_history(history)
        + [{"role": "user", "content": f"Sources:\n{context}\n\nQuestion: {question}"}]
    )


def source_payload(hits):
    return [
        {
            "n": i,
            "doc_id": h["meta"].get("doc_id"),
            "title": h["meta"].get("title"),
            "page": h["meta"].get("page"),
            "domain": h["meta"].get("domain"),
            "snippet": h["text"][:320],
            "score": round(1 - h["distance"], 3) if h["distance"] is not None else None,
        }
        for i, h in enumerate(hits, start=1)
    ]


def answer_events(question, project_id, domain=None, history=None):
    """Generate the events of one answer: a 'meta' event with the sources, then
    'token' events with the text, then 'done'."""
    history = history or []
    standalone = rewrite_question(question, history) if needs_rewrite(question, history) else question

    used_domain = domain or detect_domain(standalone)
    hits = retrieve(standalone, project_id, used_domain)
    if not hits and used_domain and not domain:
        used_domain = None  # the auto-detected guess was too narrow, search everything
        hits = retrieve(standalone, project_id, None)

    yield {
        "type": "meta",
        "found": bool(hits),
        "domain": used_domain,
        "query": standalone,
        "sources": source_payload(hits),
    }
    if not hits:
        yield {"type": "token", "text": NOT_FOUND}
        yield {"type": "done"}
        return

    for piece in ollama_stream(build_messages(standalone, hits, history)):
        yield {"type": "token", "text": piece}
    yield {"type": "done"}
