"""Superadmin beta dashboard.

The dashboard UI is the Next.js app in TRACEPAY/dashboard. Sign-in is phone and password for an
account whose app_metadata.role is superadmin. Metrics then require that session. Failed sign-in
attempts are rate limited per client address.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app import auth_service, superadmin_metrics
from app.auth import fetch_supabase_user
from app.auth_errors import AuthError
from app.config import settings
from app.rate_limit import enforce_rate_limit

router = APIRouter()


class SignInBody(BaseModel):
    phone: str = Field(default="", max_length=32)
    password: str = Field(default="", max_length=128)


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _require_superadmin(authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in to view the dashboard.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token or len(token) > 8192:
        raise HTTPException(status_code=401, detail="Sign in to view the dashboard.")
    user = await asyncio.to_thread(fetch_supabase_user, token, 4)
    if auth_service.app_metadata_role(user) != "superadmin":
        raise HTTPException(status_code=401, detail="Sign in with the superadmin account.")


@router.post("/superadmin/api/session")
async def create_session(body: SignInBody, request: Request) -> dict[str, str]:
    enforce_rate_limit(f"superadmin-signin:{_client(request)}", 10, 10 * 60)
    try:
        access_token = await asyncio.to_thread(auth_service.open_superadmin_session, body.phone, body.password)
    except AuthError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from None
    return {"accessToken": access_token}


@router.get("/superadmin/api/metrics")
async def dashboard_metrics(
    days: int = Query(default=30, ge=1, le=365),
    refresh: bool = False,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    await _require_superadmin(authorization)
    snapshot = await asyncio.to_thread(superadmin_metrics.get_snapshot, force=refresh)
    payload = superadmin_metrics.build_metrics(
        snapshot,
        days=days,
        now=datetime.now(timezone.utc),
        full_price_cents=settings.full_analysis_price_cents,
        monitoring_price_cents=settings.monitoring_price_cents,
        ai_daily_item_limit=settings.ai_daily_item_limit,
        ai_price_overrides=settings.ai_model_prices_json,
    )
    return payload


@router.get("/superadmin/api/accounts/{user_id}")
async def account_detail(
    user_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    await _require_superadmin(authorization)
    if not superadmin_metrics.ACCOUNT_ID.match(user_id):
        raise HTTPException(status_code=404, detail="That account was not found.")
    snapshot = await asyncio.to_thread(superadmin_metrics.get_snapshot, force=False)
    detail = superadmin_metrics.build_account(snapshot, user_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="That account was not found.")
    return detail
