"""HTTP API for the RAG pipeline. Start it with:  uvicorn app:app --port 8000"""

import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import rag

log = logging.getLogger("rag")


@asynccontextmanager
async def lifespan(_app):
    if os.getenv("PRELOAD_EMBEDDER", "1") == "1":
        log.warning("Loading embedding model %s ...", rag.EMBED_MODEL)
        rag.get_embedder()  # first run downloads the model; later runs start fast
        log.warning("Embedding model ready.")
    yield


app = FastAPI(title="Construction RAG Service", lifespan=lifespan)


class IngestReq(BaseModel):
    file_path: str
    doc_id: str
    project_id: str
    domain: str = "general"
    title: str | None = None


class Turn(BaseModel):
    role: str
    content: str


class QueryReq(BaseModel):
    question: str
    project_id: str
    domain: str | None = None
    history: list[Turn] = Field(default_factory=list)


def _check(req: QueryReq):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    domain = req.domain if req.domain in rag.DOMAINS else None
    return req.question.strip(), domain, [t.model_dump() for t in req.history]


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": rag.LLM_MODEL,
        "embedder": rag.EMBED_MODEL,
        "chunks": rag.get_collection().count(),
        **rag.ollama_status(),
    }


@app.post("/ingest")
def ingest(req: IngestReq):
    if not os.path.isfile(req.file_path):
        raise HTTPException(status_code=400, detail="The uploaded file could not be found on the document service.")
    try:
        result = rag.ingest_pdf(req.file_path, req.doc_id, req.project_id, req.domain, req.title)
    except Exception as exc:  # unreadable or encrypted PDF
        raise HTTPException(status_code=400, detail=f"Unable to read this PDF: {exc}") from exc
    if result["chunks"] == 0:
        rag.remove_document(req.doc_id)
        raise HTTPException(
            status_code=422,
            detail="No readable text found. This looks like a scanned PDF; run OCR on it first.",
        )
    return result


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    rag.remove_document(doc_id)
    return {"ok": True}


@app.post("/query")
def query(req: QueryReq):
    question, domain, history = _check(req)
    text, meta = [], None
    try:
        for event in rag.answer_events(question, req.project_id, domain, history):
            if event["type"] == "meta":
                meta = event
            elif event["type"] == "token":
                text.append(event["text"])
    except rag.OllamaError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"answer": "".join(text), "sources": meta["sources"], "domain": meta["domain"]}


@app.post("/query/stream")
def query_stream(req: QueryReq):
    question, domain, history = _check(req)

    def lines():
        try:
            for event in rag.answer_events(question, req.project_id, domain, history):
                yield json.dumps(event) + "\n"
        except rag.OllamaError as exc:
            yield json.dumps({"type": "error", "message": str(exc)}) + "\n"
        except Exception:  # keep the stream well-formed whatever goes wrong
            log.exception("Query failed")
            yield json.dumps({"type": "error", "message": "Something went wrong while answering."}) + "\n"

    return StreamingResponse(lines(), media_type="application/x-ndjson")
