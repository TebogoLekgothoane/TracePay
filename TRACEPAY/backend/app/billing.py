"""Paid entitlements: R49 once-off full analysis and R299 annual monitoring.

Purchases are made in the app stores through RevenueCat and written here by
`app.revenuecat`, which re-reads them from RevenueCat. This module owns the shared tables
and the entitlement answer the app reads.

Annual monitoring is a bundle: an annual purchase also unlocks the full analysis, and that
unlock outlives the monitoring year.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger("tracepay.billing")

Product = Literal["full_analysis", "annual_monitoring"]
CURRENCY = "ZAR"
TIMEOUT_SECONDS = 15
DEFAULT_ANALYSIS_KEY = "primary"
LIVE_SUBSCRIPTION_STATUSES = ("active", "non_renewing", "attention")
# Products that unlock the full analysis once paid (annual monitoring bundles it).
UNLOCKING_PRODUCTS = ("full_analysis", "annual_monitoring")


class _Conflict(Exception):
    pass


def product_price_cents(product: str) -> int:
    return (
        settings.full_analysis_price_cents
        if product == "full_analysis"
        else settings.monitoring_price_cents
    )


def products_payload() -> dict[str, object]:
    return {
        "currency": CURRENCY,
        "full_analysis": {
            "price_cents": settings.full_analysis_price_cents,
            "billing": "once_off",
        },
        "annual_monitoring": {
            "price_cents": settings.monitoring_price_cents,
            "billing": "annual",
            "available": bool(settings.revenuecat_secret_key.strip()),
        },
    }


# --- Supabase (service role) ---------------------------------------------------


def _service_headers() -> dict[str, str]:
    key = settings.supabase_service_role_key.strip()
    if not key or not settings.supabase_url.strip():
        logger.error("billing_unavailable reason=supabase_service_role_missing")
        raise HTTPException(status_code=503, detail="Payments are not available right now.")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _rest(
    table: str,
    *,
    method: str,
    query: str = "",
    body: object | None = None,
) -> list[dict[str, Any]]:
    headers = _service_headers()
    if method in ("POST", "PATCH"):
        headers["Prefer"] = "return=representation"
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}{query}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    try:
        with urlopen(
            Request(url, data=data, headers=headers, method=method), timeout=TIMEOUT_SECONDS
        ) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as error:
        if error.code == 409:
            raise _Conflict from None
        logger.warning("billing_db_failed table=%s status=%s", table, error.code)
        raise HTTPException(
            status_code=503, detail="Payments are temporarily unavailable."
        ) from None
    except (URLError, TimeoutError, ValueError):
        logger.warning("billing_db_failed table=%s error_type=transport", table)
        raise HTTPException(
            status_code=503, detail="Payments are temporarily unavailable."
        ) from None
    return json.loads(raw) if raw else []


def _eq(value: str) -> str:
    return quote(value, safe="")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Entitlements --------------------------------------------------------------


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _subscription_entitled(row: dict[str, Any] | None) -> bool:
    if not row or row.get("status") not in LIVE_SUBSCRIPTION_STATUSES:
        return False
    end = _parse_time(row.get("current_period_end"))
    return end is not None and end > datetime.now(timezone.utc)


def load_entitlements(user_id: str) -> dict[str, Any]:
    purchases = _rest(
        "billing_purchases",
        method="GET",
        query=(
            "?select=reference,product,analysis_key,status,paid_at,created_at"
            f"&user_id=eq.{_eq(user_id)}&order=created_at.desc&limit=50"
        ),
    )
    subscriptions = _rest(
        "monitoring_subscriptions",
        method="GET",
        query=(
            "?select=status,current_period_start,current_period_end,"
            "cancel_at_period_end,last_payment_status"
            f"&user_id=eq.{_eq(user_id)}&limit=1"
        ),
    )
    paid = [r for r in purchases if r["product"] in UNLOCKING_PRODUCTS and r["status"] == "succeeded"]
    subscription = subscriptions[0] if subscriptions else None
    entitled = _subscription_entitled(subscription)
    status = subscription["status"] if subscription else "none"
    if subscription and not entitled and status in LIVE_SUBSCRIPTION_STATUSES:
        status = "expired"
    return {
        "full_analysis": {
            "unlocked": bool(paid),
            "analysis_keys": sorted({r["analysis_key"] for r in paid}),
            "purchased_at": paid[0]["paid_at"] if paid else None,
        },
        "monitoring": {
            "active": entitled,
            "status": status,
            "current_period_end": subscription.get("current_period_end") if subscription else None,
            "cancel_at_period_end": bool(subscription and subscription.get("cancel_at_period_end")),
            "last_payment_status": subscription.get("last_payment_status") if subscription else None,
        },
    }


def _upsert_subscription(user_id: str, fields: dict[str, Any]) -> None:
    fields = {k: v for k, v in fields.items() if v is not None}
    fields["updated_at"] = _now()
    rows = _rest(
        "monitoring_subscriptions", method="GET", query=f"?select=user_id&user_id=eq.{_eq(user_id)}&limit=1"
    )
    if rows:
        _rest("monitoring_subscriptions", method="PATCH", query=f"?user_id=eq.{_eq(user_id)}", body=fields)
    else:
        _rest("monitoring_subscriptions", method="POST", body={"user_id": user_id, **fields})
