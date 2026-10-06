import asyncio
import logging
import time
import uuid

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.auth import require_supabase_user
from app.behaviour_analysis import build_user_behaviour_analysis
from app.category_catalog import fetch_category_names
from app.financial_features import build_user_feature_snapshot
from app.financial_reasoning import build_user_financial_reasoning
from app.leak_detection import build_user_leak_detections
from app.rate_limit import enforce_rate_limit
from categorisation.reprocess import (
    as_categorisable,
    classification_update_payload,
    metrics_dict,
    reprocess_transactions,
)
from pdf_processor.main import PdfProcessingError, process_pdf

PDF_MAGIC = b"%PDF"
MAX_STATEMENT_BYTES = 20 * 1024 * 1024
# Multipart wrappers are small; reject declared bodies clearly past the file cap.
MAX_REQUEST_OVERHEAD_BYTES = 64 * 1024
READ_CHUNK_BYTES = 1024 * 1024

app = FastAPI(title="TRACEPAY API", version="1.0.0")
logger = logging.getLogger("tracepay.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def _reject_oversized_content_length(request: Request) -> None:
    raw = request.headers.get("content-length")
    if not raw:
        return
    try:
        declared = int(raw)
    except ValueError:
        return
    if declared > MAX_STATEMENT_BYTES + MAX_REQUEST_OVERHEAD_BYTES:
        raise HTTPException(status_code=413, detail="Statements must be smaller than 20 MB.")


async def read_upload_capped(upload: UploadFile, max_bytes: int) -> bytes:
    """Read at most max_bytes + 1 so oversized uploads are rejected without full buffering."""
    if upload.size is not None and upload.size > max_bytes:
        raise HTTPException(status_code=413, detail="Statements must be smaller than 20 MB.")

    chunks: list[bytes] = []
    total = 0
    limit = max_bytes + 1
    while total < limit:
        chunk = await upload.read(min(READ_CHUNK_BYTES, limit - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)

    if total > max_bytes:
        raise HTTPException(status_code=413, detail="Statements must be smaller than 20 MB.")
    return b"".join(chunks)


@app.middleware("http")
async def extraction_ip_rate_limit(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/extraction/preview":
        host = request.client.host if request.client else "unknown"
        try:
            enforce_rate_limit(f"pdf-ip:{host}", 20, 15 * 60)
        except HTTPException as error:
            return JSONResponse(status_code=error.status_code, content={"detail": error.detail})
    return await call_next(request)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = uuid.uuid4().hex[:8]
    started = time.perf_counter()
    try:
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.info("request_complete id=%s method=%s path=%s status=%s duration_ms=%s", request_id, request.method, request.url.path, response.status_code, elapsed_ms)
        response.headers["X-TracePay-Request-Id"] = request_id
        return response
    except Exception:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.exception("request_error id=%s method=%s path=%s duration_ms=%s", request_id, request.method, request.url.path, elapsed_ms)
        raise


@app.get("/health")
def health() -> dict[str, str]:
    logger.info("health_check")
    return {"status": "ok"}


@app.post("/extraction/preview")
async def extraction_preview(
    request: Request,
    file: UploadFile = File(...),
    password: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
    _user_id: str = Depends(require_supabase_user),
) -> dict[str, object]:
    """Extract and validate a PDF without writing financial data to the database."""
    enforce_rate_limit(f"pdf-user:{_user_id}", 8, 15 * 60)
    _reject_oversized_content_length(request)
    filename = file.filename or "statement"
    logger.info("extraction_started filename=%s content_type=%s", filename, file.content_type)
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF statements are supported.")

    content = await read_upload_capped(file, MAX_STATEMENT_BYTES)
    logger.info("extraction_file_read filename=%s size_bytes=%s", filename, len(content))
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded statement is empty.")
    if not content.startswith(PDF_MAGIC):
        raise HTTPException(status_code=415, detail="Only PDF statements are supported.")

    try:
        access_token = (authorization or "").removeprefix("Bearer ").strip()

        def extract_statement():
            # Always load the live catalog so statement categories can be mapped.
            # AI categorisation still respects AI_CATEGORISATION_ENABLED inside categorise_batch.
            category_names = fetch_category_names(access_token) if access_token else []
            return process_pdf(
                content,
                filename,
                _user_id,
                password,
                category_names,
                access_token,
            )

        result = await asyncio.to_thread(extract_statement)
    except PdfProcessingError as error:
        logger.warning("extraction_failed filename=%s reason=%s", filename, error)
        raise HTTPException(status_code=422, detail=str(error)) from error

    logger.info("extraction_completed filename=%s method=%s status=%s transactions=%s confidence=%s", filename, result.raw_extraction.extraction_method, result.validation.status, len(result.transactions), result.validation.confidence)
    return result.model_dump(mode="json")


class ReprocessTransactionIn(BaseModel):
    transaction_id: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=500)
    amount: float
    transaction_type: str = Field(pattern="^(debit|credit)$")


class ReprocessRequest(BaseModel):
    transactions: list[ReprocessTransactionIn] = Field(min_length=1, max_length=500)


@app.post("/categorisation/reprocess")
async def categorisation_reprocess(
    payload: ReprocessRequest,
    authorization: str | None = Header(default=None),
    _user_id: str = Depends(require_supabase_user),
) -> dict[str, object]:
    """Re-run categorisation for existing transactions without creating duplicates."""
    enforce_rate_limit(f"categorise-user:{_user_id}", 10, 15 * 60)
    access_token = (authorization or "").removeprefix("Bearer ").strip()

    def run_reprocess() -> dict[str, object]:
        category_names = fetch_category_names(access_token) if access_token else []
        items = [
            as_categorisable(
                item.transaction_id,
                item.description,
                item.amount,
                item.transaction_type,
            )
            for item in payload.transactions
        ]
        run = reprocess_transactions(items, category_names, access_token=access_token)
        return {
            "classifications": classification_update_payload(run.results),
            "metrics": metrics_dict(run.metrics),
        }

    result = await asyncio.to_thread(run_reprocess)
    logger.info(
        "categorisation_reprocess_completed user_id_prefix=%s total=%s categorised=%s",
        _user_id[:8],
        result["metrics"]["total_transactions"],  # type: ignore[index]
        result["metrics"]["categorised_transactions"],  # type: ignore[index]
    )
    return result


@app.get("/financial-features")
async def financial_features(
    authorization: str | None = Header(default=None),
    _user_id: str = Depends(require_supabase_user),
) -> dict[str, object]:
    """Return user-scoped financial observations without making leak decisions."""
    enforce_rate_limit(f"features-user:{_user_id}", 20, 15 * 60)
    access_token = (authorization or "").removeprefix("Bearer ").strip()
    snapshot = await build_user_feature_snapshot(_user_id, access_token)
    logger.info(
        "financial_features_completed user_id_prefix=%s transactions=%s merchants=%s categories=%s",
        _user_id[:8],
        snapshot.transaction_count,
        len(snapshot.merchants),
        len(snapshot.categories),
    )
    return snapshot.model_dump(mode="json")


@app.get("/behaviour-analysis")
async def behaviour_analysis(
    authorization: str | None = Header(default=None),
    _user_id: str = Depends(require_supabase_user),
) -> dict[str, object]:
    """Return neutral, user-scoped behavioural observations."""
    enforce_rate_limit(f"behaviour-user:{_user_id}", 20, 15 * 60)
    access_token = (authorization or "").removeprefix("Bearer ").strip()
    result = await build_user_behaviour_analysis(_user_id, access_token)
    logger.info(
        "behaviour_analysis_completed user_id_prefix=%s transactions=%s observations=%s",
        _user_id[:8],
        result.transaction_count,
        len(result.observations),
    )
    return result.model_dump(mode="json")


@app.get("/leak-detections")
async def leak_detections(
    authorization: str | None = Header(default=None),
    _user_id: str = Depends(require_supabase_user),
) -> dict[str, object]:
    """Return current deterministic potential leaks without persisting state."""
    enforce_rate_limit(f"leaks-user:{_user_id}", 20, 15 * 60)
    access_token = (authorization or "").removeprefix("Bearer ").strip()
    result = await build_user_leak_detections(_user_id, access_token)
    logger.info(
        "leak_detections_completed user_id_prefix=%s transactions=%s leaks=%s",
        _user_id[:8],
        result.transaction_count,
        len(result.leaks),
    )
    return result.model_dump(mode="json")


@app.get("/financial-reasoning")
async def financial_reasoning(
    authorization: str | None = Header(default=None),
    _user_id: str = Depends(require_supabase_user),
) -> dict[str, object]:
    """Return sanitized deterministic explanations for current potential leaks."""
    enforce_rate_limit(f"reasoning-user:{_user_id}", 20, 15 * 60)
    access_token = (authorization or "").removeprefix("Bearer ").strip()
    result = await build_user_financial_reasoning(_user_id, access_token)
    logger.info(
        "financial_reasoning_completed user_id_prefix=%s transactions=%s analyses=%s",
        _user_id[:8],
        result.transaction_count,
        len(result.analyses),
    )
    return result.model_dump(mode="json")
