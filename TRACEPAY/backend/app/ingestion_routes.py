"""POST /ingestion/readings for the mobile app. Response and error shapes match the former Node server."""

import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.auth import _fetch_supabase_user_id
from app.auth_errors import AuthError
from app.ingestion import MAX_INGESTION_JSON_BYTES, ingest_readings
from app.rate_limit import allow_request

router = APIRouter()

MINUTE = 60
LIMIT_MESSAGE = "Too many attempts. Wait a few minutes and try again."


def _authenticate(authorization: str | None) -> str:
    parts = (authorization or "").split(" ")
    if len(parts) < 2 or parts[0] != "Bearer" or not parts[1]:
        raise AuthError(401, "Sign in to sync phone readings.")
    try:
        return _fetch_supabase_user_id(parts[1])
    except HTTPException as error:
        if error.status_code == 401:
            raise AuthError(401, "Your session expired. Please sign in again.") from None
        raise AuthError(error.status_code, str(error.detail)) from None


@router.post("/ingestion/readings", status_code=202)
async def ingest_readings_route(request: Request) -> JSONResponse:
    ip = request.client.host if request.client else "unknown"
    if not allow_request(f"ingestion:{ip}", 20, 10 * MINUTE):
        raise AuthError(429, LIMIT_MESSAGE)

    raw = await request.body()
    if len(raw) > MAX_INGESTION_JSON_BYTES:
        raise AuthError(413, "Phone readings batch is too large.")
    try:
        payload = json.loads(raw) if raw else None
    except ValueError:
        raise AuthError(400, "Request body must be valid JSON.") from None

    user_id = await asyncio.to_thread(_authenticate, request.headers.get("authorization"))
    if not allow_request(f"ingestion-user:{user_id}", 20, 10 * MINUTE):
        raise AuthError(429, LIMIT_MESSAGE)

    result = await asyncio.to_thread(ingest_readings, user_id, payload)
    return JSONResponse(status_code=202, content=result)
