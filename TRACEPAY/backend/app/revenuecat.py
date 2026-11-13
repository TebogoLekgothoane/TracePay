"""In-app purchases through RevenueCat.

The app never tells us what a user owns. After a purchase (and on every RevenueCat webhook)
we ask RevenueCat's REST API for the subscriber and write the result into the same tables
the rest of billing reads, so entitlements have one shape whatever the payment rail.

The RevenueCat app user id is the Supabase user id, set by the app at sign-in.
"""

from __future__ import annotations

import hmac
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app import billing
from app.config import settings

logger = logging.getLogger("tracepay.revenuecat")

TIMEOUT_SECONDS = 15
ANALYSIS_KEY = billing.DEFAULT_ANALYSIS_KEY


def _headers() -> dict[str, str]:
    key = settings.revenuecat_secret_key.strip()
    if not key:
        logger.error("revenuecat_unavailable reason=secret_key_missing")
        raise HTTPException(status_code=503, detail="Payments are not available right now.")
    return {"Authorization": f"Bearer {key}", "Accept": "application/json"}


def _fetch_subscriber(user_id: str) -> dict[str, Any]:
    url = f"{settings.revenuecat_base_url.rstrip('/')}/v1/subscribers/{quote(user_id, safe='')}"
    try:
        with urlopen(Request(url, headers=_headers()), timeout=TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        logger.warning("revenuecat_fetch_failed status=%s", error.code)
        raise HTTPException(status_code=503, detail="Payments are temporarily unavailable.") from None
    except (URLError, TimeoutError, ValueError):
        logger.warning("revenuecat_fetch_failed error_type=transport")
        raise HTTPException(status_code=503, detail="Payments are temporarily unavailable.") from None
    subscriber = payload.get("subscriber") if isinstance(payload, dict) else None
    return subscriber if isinstance(subscriber, dict) else {}


def verify_webhook_authorization(header: str | None) -> bool:
    secret = settings.revenuecat_webhook_secret.strip()
    if not secret or not header:
        return False
    token = header.strip().removeprefix("Bearer ").strip()
    return hmac.compare_digest(token.encode("utf-8"), secret.encode("utf-8"))


def _latest_non_subscription(subscriber: dict[str, Any], product_id: str) -> dict[str, Any] | None:
    non_subscriptions = subscriber.get("non_subscriptions")
    purchases = non_subscriptions.get(product_id) if isinstance(non_subscriptions, dict) else None
    if not isinstance(purchases, list) or not purchases:
        return None
    dated = [p for p in purchases if isinstance(p, dict)]
    dated.sort(key=lambda p: str(p.get("purchase_date") or ""))
    return dated[-1] if dated else None


def _subscription(subscriber: dict[str, Any], product_id: str) -> dict[str, Any] | None:
    subscriptions = subscriber.get("subscriptions")
    entry = subscriptions.get(product_id) if isinstance(subscriptions, dict) else None
    return entry if isinstance(entry, dict) else None


def _record_purchase(
    user_id: str, product: str, reference: str, paid_at: str, transaction_id: str | None
) -> None:
    """Idempotent: one succeeded purchase per user/product/analysis (unique index)."""
    existing = billing._rest(
        "billing_purchases",
        method="GET",
        query=(
            f"?select=reference,status&user_id=eq.{billing._eq(user_id)}"
            f"&product=eq.{product}&analysis_key=eq.{ANALYSIS_KEY}"
            "&status=in.(pending,succeeded)&limit=1"
        ),
    )
    price = billing.product_price_cents(product)
    if existing:
        if existing[0]["status"] == "succeeded":
            return
        # A stale pending row is open: the store purchase supersedes it.
        billing._rest(
            "billing_purchases",
            method="PATCH",
            query=f"?reference=eq.{billing._eq(existing[0]['reference'])}",
            body={"status": "abandoned", "failure_reason": "paid_in_app", "updated_at": billing._now()},
        )
    try:
        billing._rest(
            "billing_purchases",
            method="POST",
            body={
                "user_id": user_id,
                "product": product,
                "analysis_key": ANALYSIS_KEY,
                "reference": reference,
                "status": "succeeded",
                "amount_cents": price,
                "currency": billing.CURRENCY,
                "provider_transaction_id": transaction_id,
                "paid_at": paid_at,
            },
        )
    except billing._Conflict:
        return  # a concurrent sync already recorded it


def _refund_missing(user_id: str, product: str, still_owned: bool) -> None:
    if still_owned:
        return
    billing._rest(
        "billing_purchases",
        method="PATCH",
        query=(
            f"?user_id=eq.{billing._eq(user_id)}&product=eq.{product}"
            "&reference=like.rc_*&status=eq.succeeded"
        ),
        body={"status": "refunded", "refunded_at": billing._now(), "updated_at": billing._now()},
    )


def sync_subscriber(user_id: str) -> dict[str, Any]:
    """Pull the user's store purchases from RevenueCat into our tables; return entitlements."""
    subscriber = _fetch_subscriber(user_id)
    now = datetime.now(timezone.utc)

    analysis = _latest_non_subscription(subscriber, settings.revenuecat_full_analysis_product_id)
    if analysis:
        txn = str(analysis.get("store_transaction_id") or analysis.get("id") or "")
        _record_purchase(
            user_id,
            "full_analysis",
            f"rc_{txn or user_id}_full_analysis"[:80],
            str(analysis.get("purchase_date") or billing._now()),
            txn or None,
        )
    _refund_missing(user_id, "full_analysis", bool(analysis))

    monitoring = _subscription(subscriber, settings.revenuecat_monitoring_product_id)
    if monitoring:
        expires = billing._parse_time(monitoring.get("expires_date"))
        purchased = str(monitoring.get("original_purchase_date") or billing._now())
        if expires and expires > now:
            # Annual monitoring bundles the full analysis, and that outlives the year.
            _record_purchase(
                user_id,
                "annual_monitoring",
                f"rc_{user_id}_annual_monitoring"[:80],
                purchased,
                None,
            )
            if monitoring.get("billing_issues_detected_at"):
                status = "attention"
            elif monitoring.get("unsubscribe_detected_at"):
                status = "non_renewing"
            else:
                status = "active"
        else:
            status = "expired"
        billing._upsert_subscription(
            user_id,
            {
                "status": status,
                "current_period_start": str(monitoring.get("purchase_date") or purchased),
                "current_period_end": expires.isoformat() if expires else None,
                "cancel_at_period_end": status == "non_renewing",
                "last_payment_status": "failed" if status == "attention" else "paid",
            },
        )
    return billing.load_entitlements(user_id)


def handle_webhook(authorization: str | None, raw_body: bytes) -> dict[str, str]:
    if not verify_webhook_authorization(authorization):
        raise HTTPException(status_code=401, detail="Invalid authorization.")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload.") from None
    event = payload.get("event") if isinstance(payload, dict) else None
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload.")
    # We never trust the event body for access; it only tells us whose state to re-read.
    aliases = event.get("aliases") if isinstance(event.get("aliases"), list) else []
    candidates = [event.get("app_user_id"), event.get("original_app_user_id"), *aliases]
    # Supabase user ids are UUIDs; anonymous RevenueCat ids are not ours to settle.
    user_ids = list(dict.fromkeys(value for value in candidates if _is_uuid(value)))
    if not user_ids:
        return {"status": "ignored"}
    for user_id in user_ids[:3]:
        sync_subscriber(user_id)
    return {"status": "ok"}


def _is_uuid(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True
