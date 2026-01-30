from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv

# Load .env from web/backend/ so GROQ_API_KEY etc. are available
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, get_db
from .forensic_engine import ForensicEngine
from .models import (
    AnalyzeRequest,
    AnalyzeResponse,
    FreezeRequest,
    FreezeResponse,
    MoneyLeak,
    TransactionIn,
)
from .routers import accounts, admin, auth, mobile, ml, mtn_momo, open_banking, voice

app = FastAPI(title="TracePay – Forensic Engine", version="1.0.0")

# Initialize database tables
Base.metadata.create_all(bind=engine)

# Dashboard runs separately (Next.js dev server), so enable permissive CORS for hackathon.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

forensic_engine = ForensicEngine()

# In-memory "revocations" to simulate freezing / revoking consent.
FROZEN: List[Dict[str, Any]] = []


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(payload: Any = Body(...)) -> AnalyzeResponse:
    """
    Accepts either:
    - { "transactions": [...] }
    - or a raw list of transactions [...]
    """
    if isinstance(payload, list):
        req = AnalyzeRequest(transactions=[TransactionIn(**t) for t in payload])
    elif isinstance(payload, dict) and "transactions" in payload:
        req = AnalyzeRequest(**payload)
    else:
        raise HTTPException(status_code=400, detail="Invalid payload. Send {transactions:[...]} or a raw list.")

    result = forensic_engine.analyze([t.model_dump() for t in req.transactions])
    # Cast money_leaks into pydantic model for stable API output
    leaks = [MoneyLeak(**l) for l in result["money_leaks"]]
    return AnalyzeResponse(
        financial_health_score=result["financial_health_score"],
        health_band=result["health_band"],
        money_leaks=leaks,
        summary_plain_language=result["summary_plain_language"],
    )


@app.post("/freeze", response_model=FreezeResponse)
def freeze(req: FreezeRequest) -> FreezeResponse:
    """
    Simulates "revoking consent" / stopping a leak.
    In the real OB flow this would map to revoking a consent or blocking a payment action.
    """
    if not (req.leak_id or req.transaction_id or req.consent_id):
        raise HTTPException(status_code=400, detail="Provide at least one of leak_id, transaction_id, consent_id.")

    item = req.model_dump()
    FROZEN.append(item)
    return FreezeResponse(status="ok", message="Freeze recorded. (Simulation: consent revoked / leak blocked)")


@app.get("/frozen")
def frozen() -> Dict[str, Any]:
    return {"count": len(FROZEN), "items": FROZEN[-50:]}


# Include routers
app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(admin.router)
app.include_router(mobile.router)
app.include_router(voice.router)
app.include_router(ml.router)
app.include_router(open_banking.router)
app.include_router(mtn_momo.router)


