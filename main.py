from datetime import datetime
from pathlib import Path
from typing import Dict, List

import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:1.5b"  # Small model for low RAM


DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class DocumentMeta(BaseModel):
    id: str
    name: str
    size: int
    created_at: str


class QARequest(BaseModel):
    document_id: str
    question: str


class OllamaResponse(BaseModel):
    response: str


app = FastAPI(title="AI Study Assistant Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _document_path(doc_id: str) -> Path:
    return DATA_DIR / f"{doc_id}.txt"


def _read_document(doc_id: str) -> str:
    path = _document_path(doc_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Document not found")
    return path.read_text(encoding="utf-8", errors="ignore")


def _list_documents() -> List[DocumentMeta]:
    items: List[DocumentMeta] = []
    for path in DATA_DIR.glob("*.txt"):
        stat = path.stat()
        items.append(
            DocumentMeta(
                id=path.stem,
                name=path.name,
                size=stat.st_size,
                created_at=datetime.fromtimestamp(stat.st_ctime).isoformat(),
            )
        )
    items.sort(key=lambda d: d.created_at, reverse=True)
    return items


def _call_ollama(prompt: str) -> str:
    try:
        payload: Dict[str, object] = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }
        resp = requests.post(OLLAMA_URL, json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        text = data.get("response") or ""
        if not isinstance(text, str):
            raise ValueError("Unexpected Ollama response format")
        return text.strip()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ollama error: {exc}") from exc


@app.get("/api/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/documents", response_model=List[DocumentMeta])
def get_documents() -> List[DocumentMeta]:
    return _list_documents()


@app.post("/api/documents", response_model=DocumentMeta)
async def upload_document(file: UploadFile = File(...)) -> DocumentMeta:
    if not file.filename.lower().endswith(".txt"):
        raise HTTPException(status_code=400, detail="Only .txt files are supported")

    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="ignore")

    if not text.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    doc_id = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    path = _document_path(doc_id)
    path.write_text(text, encoding="utf-8")

    meta = DocumentMeta(
        id=doc_id,
        name=file.filename,
        size=len(text.encode("utf-8")),
        created_at=datetime.utcnow().isoformat(),
    )
    return meta


@app.get("/api/documents/{document_id}")
def get_document_content(document_id: str) -> Dict[str, str]:
    content = _read_document(document_id)
    return {"id": document_id, "content": content}


@app.post("/api/documents/{document_id}/summarize", response_model=OllamaResponse)
def summarize_document(document_id: str) -> OllamaResponse:
    content = _read_document(document_id)
    prompt = f"Summarize this text in 3-4 sentences:\n\n{content[:1500]}"
    summary = _call_ollama(prompt)
    return OllamaResponse(response=summary)


@app.post("/api/documents/{document_id}/explain", response_model=OllamaResponse)
def explain_document(document_id: str) -> OllamaResponse:
    content = _read_document(document_id)
    prompt = f"Explain this simply for a 10-year-old:\n\n{content[:1500]}"
    explanation = _call_ollama(prompt)
    return OllamaResponse(response=explanation)


@app.post("/api/qa", response_model=OllamaResponse)
def answer_question(body: QARequest) -> OllamaResponse:
    content = _read_document(body.document_id)
    context = content[:2000]
    prompt = (
        f"Context: {context}\n\n"
        f"Question: {body.question}\n\n"
        "Answer based on context:"
    )
    answer = _call_ollama(prompt)
    return OllamaResponse(response=answer)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)

