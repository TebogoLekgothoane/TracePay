"""Superadmin beta dashboard data endpoint.

The dashboard UI is the Next.js app in TRACEPAY/dashboard. It calls /superadmin/api/metrics,
which needs the operator token in the X-Superadmin-Token header. Failed token attempts are rate
limited per client address.
"""

from __future__ import annotations

import asyncio
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query, Request

from app import superadmin_metrics
from app.config import settings
from app.rate_limit import enforce_rate_limit

router = APIRouter()

MIN_TOKEN_LENGTH = 32


def _require_operator(request: Request, provided: str | None) -> None:
    expected = settings.superadmin_dashboard_token.strip()
    if len(expected) < MIN_TOKEN_LENGTH:
        raise HTTPException(
            status_code=503,
            detail="The superadmin dashboard is not configured. Set SUPERADMIN_DASHBOARD_TOKEN (32+ characters).",
        )
    client = request.client.host if request.client else "unknown"
    enforce_rate_limit(f"superadmin-auth:{client}", 30, 15 * 60)
    if not provided or not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="That superadmin token is not correct.")


@router.get("/superadmin/api/metrics")
async def dashboard_metrics(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    refresh: bool = False,
    x_superadmin_token: str | None = Header(default=None, alias="X-Superadmin-Token"),
) -> dict[str, object]:
    _require_operator(request, x_superadmin_token)
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
