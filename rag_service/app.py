
import uuid
import requests
import chromadb

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

OLLAMA_URL = "http://localhost:11434/api/chat"
LLM_MODEL = "llama3.2"

# Initialize the embedding model and vector database.
embedder = SentenceTransformer("all-MiniLM-L6-v2")

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection(
    name="construction_docs",
    metadata={"hnsw:space": "cosine"},
)

app = FastAPI(title="Construction RAG Service")

INTERIOR_WORDS = [
    "interior", "flooring", "tile", "ceiling", "paint",
    "furniture", "lighting", "finish", "cabinet",
    "wallpaper", "kitchen",
]

EXTERIOR_WORDS = [
    "exterior", "facade", "façade", "cladding", "roof",
    "landscape", "weatherproof", "paving", "boundary",
    "elevation", "gate", "terrace",
]


class IngestReq(BaseModel):
    file_path: str
    doc_id: str
    project_id: str
    domain: str = "general"


class Turn(BaseModel):
    role: str
    content: str


class QueryReq(BaseModel):
    question: str
    project_id: str
    domain: str | None = None
    history: list[Turn] = Field(default_factory=list)


def chunk_text(text: str, size: int = 1000, overlap: int = 150):
    chunks = []
    start = 0

    while start < len(text):
        chunk = text[start:start + size]

        if chunk.strip():
            chunks.append(chunk)

        start += size - overlap

    return chunks


def detect_domain(question: str):
    question = question.lower()

    interior_count = sum(
        word in question for word in INTERIOR_WORDS
    )
    exterior_count = sum(
        word in question for word in EXTERIOR_WORDS
    )

    if interior_count > exterior_count:
        return "interior"

    if exterior_count > interior_count:
        return "exterior"

    return None


def ollama_chat(messages):
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": LLM_MODEL,
                "messages": messages,
                "stream": False,
            },
            timeout=120,
        )

        response.raise_for_status()
        return response.json()["message"]["content"]

    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama connection failed: {exc}",
        ) from exc

    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Invalid response received from Ollama.",
        ) from exc


@app.post("/ingest")
def ingest(req: IngestReq):
    try:
        reader = PdfReader(req.file_path)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unable to read PDF: {exc}",
        ) from exc

    ids = []
    documents = []
    metadatas = []

    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""

        for chunk in chunk_text(text):
            ids.append(str(uuid.uuid4()))
            documents.append(chunk)
            metadatas.append({
                "doc_id": req.doc_id,
                "project_id": req.project_id,
                "domain": req.domain,
                "page": page_number,
            })

    if documents:
        embeddings = embedder.encode(documents).tolist()

        collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    return {
        "pages": len(reader.pages),
        "chunks": len(documents),
    }


@app.post("/query")
def query(req: QueryReq):
    question = req.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    # Rewrite follow-up questions using previous conversation turns.
    if req.history:
        conversation = "\n".join(
            f"{turn.role}: {turn.content}"
            for turn in req.history
            if turn.role in ("user", "assistant")
        )

        rewritten = ollama_chat([{
            "role": "user",
            "content": (
                "Rewrite the latest question as a standalone question "
                "using the conversation context. Return only the question.\n\n"
                f"{conversation}\nuser: {question}"
            ),
        }]).strip()

        if rewritten:
            question = rewritten

    # Apply project and optional domain filters.
    domain = req.domain or detect_domain(question)

    conditions = [{"project_id": req.project_id}]

    if domain:
        conditions.append({
            "domain": {"$in": [domain, "general"]}
        })

    where = (
        {"$and": conditions}
        if len(conditions) > 1
        else conditions[0]
    )

    # Retrieve relevant document chunks.
    embedding = embedder.encode([question]).tolist()

    result = collection.query(
        query_embeddings=embedding,
        n_results=5,
        where=where,
        include=["documents", "metadatas"],
    )

    chunks = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]

    if not chunks:
        return {
            "answer": (
                "I couldn't find relevant information in the "
                "project documents."
            ),
            "sources": [],
            "domain": domain,
        }

    context = "\n\n---\n\n".join(chunks)

    messages = [{
        "role": "system",
        "content": (
            "You are a construction and design assistant. "
            "Answer only from the provided document context. "
            "If the answer is missing, say the information is not "
            "available in the provided documents. Never invent prices, "
            "dimensions, or material specifications."
        ),
    }]

    for turn in req.history:
        if turn.role in ("user", "assistant"):
            messages.append({
                "role": turn.role,
                "content": turn.content,
            })

    messages.append({
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion: {question}",
    })

    answer = ollama_chat(messages)

    # Deduplicate sources.
    sources = []
    seen = set()

    for metadata in metadatas:
        if not metadata:
            continue

        key = (
            metadata.get("doc_id"),
            metadata.get("page"),
            metadata.get("domain"),
        )

        if key not in seen:
            seen.add(key)
            sources.append({
                "doc_id": metadata.get("doc_id"),
                "page": metadata.get("page"),
                "domain": metadata.get("domain"),
            })

    return {
        "answer": answer,
        "sources": sources,
        "domain": domain,
    }


@app.get("/health")
def health():
    return {"ok": True}
