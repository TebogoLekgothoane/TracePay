from __future__ import annotations

from contextlib import asynccontextmanager
import logging
from typing import Any, AsyncIterator, Dict

from fastapi import Depends, FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import Response, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from .auth import get_current_admin_user, get_current_user
from .database import get_db
from .errors import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from .external_http import request_with_retries
from .forensic_engine import ForensicEngine
from .observability import RequestLoggingMiddleware, configure_logging
from .settings import settings
from .background_jobs import start_background_worker, stop_background_worker
from .models_db import BackgroundJob, User
from .models import (
    AnalyzeRequest,
    AnalyzeResponse,
    MoneyLeak,
)
from .routers import accounts, admin, auth, leaks, ml, mtn_momo, open_banking, voice

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    start_background_worker()
    try:
        yield
    finally:
        await stop_background_worker()


app = FastAPI(title="TracePay – Forensic Engine", version="1.0.0", lifespan=lifespan)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)
app.add_middleware(RequestLoggingMiddleware)

# Dashboard runs separately (Next.js dev server), so trust the configured frontend origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


forensic_engine = ForensicEngine()


@app.get("/v1/health")
@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/health/live")
@app.get("/health/live")
def health_live() -> Dict[str, str]:
    return {"status": "ok", "api": "reachable"}


@app.get("/v1/health/db")
@app.get("/health/db")
@app.get("/v1/db-health")
@app.get("/db-health")
def db_health(
    _current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """
    Quick connectivity check for the configured PostgreSQL database.

    If this fails, register/login will fail too.
    """

    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:  # pragma: no cover - operational diagnostic
        raise HTTPException(
            status_code=503, detail=f"Database connection failed: {exc}"
        ) from exc


@app.get("/v1/health/providers")
@app.get("/health/providers")
async def providers_health() -> Dict[str, Any]:
    checks: dict[str, dict[str, str]] = {}

    ob_mode = settings.open_banking_mode if settings.open_banking_mode == "production" else "sandbox"
    ob_configured = bool(settings.open_banking_client_id and settings.open_banking_client_secret)
    if ob_configured:
        try:
            response = await request_with_retries(
                "GET",
                f"{settings.open_banking_base_url}/health",
                timeout=5.0,
                retries=2,
            )
            checks["open_banking"] = {
                "status": "ok" if response.status_code < 500 else "degraded",
                "mode": ob_mode,
                "is_sandbox": str(ob_mode != "production").lower(),
                "base_url": settings.open_banking_base_url,
            }
        except Exception as exc:
            checks["open_banking"] = {
                "status": "unreachable",
                "detail": str(exc),
                "mode": ob_mode,
                "is_sandbox": str(ob_mode != "production").lower(),
                "base_url": settings.open_banking_base_url,
            }
    else:
        checks["open_banking"] = {
            "status": "not_configured",
            "mode": ob_mode,
            "is_sandbox": str(ob_mode != "production").lower(),
            "base_url": settings.open_banking_base_url,
        }

    checks["mtn_momo"] = {
        "status": "configured" if settings.mtn_momo_api_key else "not_configured"
    }
    checks["groq"] = {
        "status": "configured" if settings.groq_api_key else "not_configured"
    }

    ok_statuses = {"ok", "configured", "not_configured"}
    overall = (
        "ok"
        if all(check["status"] in ok_statuses for check in checks.values())
        else "degraded"
    )
    return {"status": overall, "checks": checks}


@app.get("/")
def root() -> RedirectResponse:
    """
    Browser-friendly entry point for the API server.

    The backend is API-only, so redirecting to docs is more useful than a 404
    when someone opens the service root in a browser.
    """

    return RedirectResponse(url="/docs", status_code=307)


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> Response:
    """
    Keep browser favicon requests from showing noisy 404s.

    The backend does not ship a custom favicon, so we return an empty response.
    """

    return Response(status_code=204)


@app.post("/v1/analyze", response_model=AnalyzeResponse)
@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """Analyze a request body shaped as { "transactions": [...], "context": {...} }."""
    result = forensic_engine.analyze([t.model_dump() for t in req.transactions])
    # Cast money_leaks into pydantic model for stable API output
    leaks = [MoneyLeak(**leak) for leak in result["money_leaks"]]
    return AnalyzeResponse(
        financial_health_score=result["financial_health_score"],
        health_band=result["health_band"],
        money_leaks=leaks,
        summary_plain_language=result["summary_plain_language"],
    )


@app.get("/v1/jobs/{job_id}")
@app.get("/jobs/{job_id}")
def get_background_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    job = db.query(BackgroundJob).filter(BackgroundJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job.user_id) != str(current_user.id) and current_user.role not in {
        "admin",
        "stakeholder",
    }:
        raise HTTPException(status_code=403, detail="Not allowed to view this job")
    return {
        "job_id": job.job_id,
        "type": job.job_type,
        "status": job.status,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
    }


# Include routers
app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(admin.router)
app.include_router(voice.router)
app.include_router(ml.router)
app.include_router(open_banking.router)
app.include_router(mtn_momo.router)
app.include_router(leaks.router)
app.include_router(auth.router, prefix="/v1")
app.include_router(accounts.router, prefix="/v1")
app.include_router(admin.router, prefix="/v1")
app.include_router(voice.router, prefix="/v1")
app.include_router(ml.router, prefix="/v1")
app.include_router(open_banking.router, prefix="/v1")
app.include_router(mtn_momo.router, prefix="/v1")
app.include_router(leaks.router, prefix="/v1")
