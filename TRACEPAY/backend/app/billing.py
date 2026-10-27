"""Paid entitlements: R39 once-off full analysis and R199 annual monitoring, through Paystack.

Annual monitoring is a bundle: a confirmed annual payment also unlocks the full analysis,
and that unlock outlives the monitoring year.

Access is granted only after Paystack confirms the transaction (verify call or signed
webhook) for the exact reference, amount and currency we created. The client's word
that a payment happened is never used.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger("tracepay.billing")

Product = Literal["full_analysis", "annual_monitoring"]
CURRENCY = "ZAR"
TIMEOUT_SECONDS = 15
DEFAULT_ANALYSIS_KEY = "primary"
LIVE_SUBSCRIPTION_STATUSES = ("active", "non_renewing", "attention")
# Products that unlock the full analysis once paid (annual monitoring bundles it).
UNLOCKING_PRODUCTS = ("full_analysis", "annual_monitoring")


_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


class CheckoutRequest(BaseModel):
    product: Product
    analysis_key: str = Field(default=DEFAULT_ANALYSIS_KEY, min_length=1, max_length=80)
    # Only used when the account has no email (phone sign-ups). Paystack needs one for the receipt.
    email: str | None = Field(default=None, max_length=120)


class VerifyRequest(BaseModel):
    reference: str = Field(min_length=8, max_length=80)


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
            "available": bool(settings.paystack_plan_code),
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


# --- Paystack ------------------------------------------------------------------


def _paystack(path: str, *, method: str = "GET", body: object | None = None) -> dict[str, Any]:
    secret = settings.paystack_secret_key.strip()
    if not secret:
        logger.error("billing_unavailable reason=paystack_not_configured")
        raise HTTPException(status_code=503, detail="Payments are not available right now.")
    headers = {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(
        f"{settings.paystack_base_url.rstrip('/')}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        logger.warning("paystack_request_failed path=%s status=%s", path.split("/")[1], error.code)
        raise HTTPException(
            status_code=502, detail="The payment provider rejected the request."
        ) from None
    except (URLError, TimeoutError, ValueError):
        logger.warning("paystack_request_failed error_type=transport")
        raise HTTPException(
            status_code=502, detail="The payment provider could not be reached."
        ) from None
    if not isinstance(payload, dict) or payload.get("status") is not True:
        raise HTTPException(status_code=502, detail="The payment provider returned an error.")
    result = payload.get("data")
    return result if isinstance(result, dict) else {}


def _fetch_user_email(access_token: str) -> str | None:
    request = Request(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
        headers={
            "apikey": settings.supabase_publishable_key(),
            "Authorization": f"Bearer {access_token}",
        },
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            user = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError):
        return None
    email = user.get("email") if isinstance(user, dict) else None
    return email if isinstance(email, str) and "@" in email else None


def verify_signature(raw_body: bytes, signature: str | None) -> bool:
    secret = settings.paystack_secret_key.strip()
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


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
    pending = [r for r in purchases if r["status"] == "pending"]
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
        "pending": [
            {"reference": r["reference"], "product": r["product"], "created_at": r["created_at"]}
            for r in pending
        ],
    }


# --- Checkout ------------------------------------------------------------------


def create_checkout(
    user_id: str, access_token: str, request: CheckoutRequest, _retry: bool = True
) -> dict[str, object]:
    analysis_key = (
        request.analysis_key if request.product == "full_analysis" else DEFAULT_ANALYSIS_KEY
    )
    if request.product == "annual_monitoring" and not settings.paystack_plan_code:
        raise HTTPException(status_code=503, detail="Annual monitoring is not available yet.")

    entitlements = load_entitlements(user_id)
    owned = {"status": "already_owned", "reference": None, "authorization_url": None}
    if request.product == "full_analysis":
        if analysis_key in entitlements["full_analysis"]["analysis_keys"]:
            return owned
    elif entitlements["monitoring"]["active"]:
        return owned

    existing = _rest(
        "billing_purchases",
        method="GET",
        query=(
            "?select=reference,authorization_url,created_at"
            f"&user_id=eq.{_eq(user_id)}&product=eq.{request.product}"
            f"&analysis_key=eq.{_eq(analysis_key)}&status=eq.pending&limit=1"
        ),
    )
    if existing:
        created = _parse_time(existing[0]["created_at"]) or datetime.now(timezone.utc)
        fresh = (datetime.now(timezone.utc) - created).total_seconds() < 60 * 60
        if fresh and existing[0].get("authorization_url"):
            return {
                "status": "pending",
                "reference": existing[0]["reference"],
                "authorization_url": existing[0]["authorization_url"],
            }
        # An old or half-made checkout: settle it with the provider first so a payment
        # that actually went through is not abandoned, then close what is left.
        verified = verify_reference(user_id, existing[0]["reference"], close_stale=True)
        if verified["status"] == "succeeded":
            return owned

    email = _fetch_user_email(access_token)
    if not email:
        supplied = (request.email or "").strip()
        if not _EMAIL.match(supplied):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "email_required",
                    "message": "Enter an email address for your payment receipt."
                    if not supplied
                    else "That email address does not look right.",
                },
            )
        email = supplied

    amount = product_price_cents(request.product)
    reference = f"tp_{uuid.uuid4().hex}"
    try:
        _rest(
            "billing_purchases",
            method="POST",
            body={
                "user_id": user_id,
                "product": request.product,
                "analysis_key": analysis_key,
                "reference": reference,
                "amount_cents": amount,
                "currency": CURRENCY,
            },
        )
    except _Conflict:
        # A concurrent request created the single live checkout; reuse it.
        if not _retry:
            raise HTTPException(status_code=409, detail="A payment is already in progress.") from None
        return create_checkout(user_id, access_token, request, _retry=False)

    body: dict[str, object] = {
        "email": email,
        "amount": amount,
        "currency": CURRENCY,
        "reference": reference,
        "callback_url": settings.paystack_callback_url,
        "metadata": {"user_id": user_id, "product": request.product, "analysis_key": analysis_key},
    }
    if request.product == "annual_monitoring":
        body["plan"] = settings.paystack_plan_code
    try:
        init = _paystack("/transaction/initialize", method="POST", body=body)
        url = init.get("authorization_url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise HTTPException(status_code=502, detail="The payment provider returned no checkout link.")
    except HTTPException:
        _rest(
            "billing_purchases",
            method="PATCH",
            query=f"?reference=eq.{_eq(reference)}",
            body={"status": "failed", "failure_reason": "initialise_failed", "updated_at": _now()},
        )
        raise
    _rest(
        "billing_purchases",
        method="PATCH",
        query=f"?reference=eq.{_eq(reference)}",
        body={"authorization_url": url, "updated_at": _now()},
    )
    return {"status": "pending", "reference": reference, "authorization_url": url}


# --- Confirmation --------------------------------------------------------------


def _load_purchase(reference: str) -> dict[str, Any] | None:
    rows = _rest(
        "billing_purchases", method="GET", query=f"?select=*&reference=eq.{_eq(reference)}&limit=1"
    )
    return rows[0] if rows else None


def apply_transaction(transaction: dict[str, Any]) -> str:
    """Settle one provider transaction against our purchase. Returns the resulting status."""
    reference = transaction.get("reference")
    purchase = _load_purchase(reference) if isinstance(reference, str) else None
    if purchase is None:
        logger.warning("billing_unknown_reference")
        return "unknown"
    if purchase["status"] in ("succeeded", "refunded"):
        return purchase["status"]

    where = f"?reference=eq.{_eq(reference)}&status=eq.pending"
    provider_status = transaction.get("status")
    if provider_status == "success":
        if (
            transaction.get("amount") != purchase["amount_cents"]
            or transaction.get("currency") != purchase["currency"]
        ):
            logger.error("billing_amount_mismatch")
            _rest(
                "billing_purchases",
                method="PATCH",
                query=where,
                body={"status": "failed", "failure_reason": "amount_mismatch", "updated_at": _now()},
            )
            return "failed"
        _rest(
            "billing_purchases",
            method="PATCH",
            query=where,
            body={
                "status": "succeeded",
                "paid_at": _now(),
                "provider_transaction_id": str(transaction.get("id", "")) or None,
                "updated_at": _now(),
            },
        )
        return "succeeded"
    if provider_status in ("failed", "abandoned", "reversed"):
        _rest(
            "billing_purchases",
            method="PATCH",
            query=where,
            body={
                "status": "abandoned" if provider_status == "abandoned" else "failed",
                "failure_reason": str(transaction.get("gateway_response") or provider_status)[:200],
                "updated_at": _now(),
            },
        )
        return "failed"
    return "pending"


def verify_reference(
    user_id: str, reference: str, *, close_stale: bool = False
) -> dict[str, Any]:
    purchase = _load_purchase(reference)
    if purchase is None or purchase["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="That payment was not found.")
    if purchase["status"] == "pending":
        try:
            transaction = _paystack(f"/transaction/verify/{_eq(reference)}")
        except HTTPException:
            if not close_stale:
                raise
            transaction = {"status": "abandoned", "reference": reference}
        result = apply_transaction(transaction)
        if result == "succeeded" and purchase["product"] == "annual_monitoring":
            _sync_subscription_from_transaction(user_id, transaction)
        if close_stale and result == "pending":
            _rest(
                "billing_purchases",
                method="PATCH",
                query=f"?reference=eq.{_eq(reference)}&status=eq.pending",
                body={"status": "abandoned", "updated_at": _now()},
            )
        purchase = _load_purchase(reference) or purchase
    return {
        "status": purchase["status"],
        "product": purchase["product"],
        "entitlements": load_entitlements(user_id),
    }


def _add_year(moment: datetime) -> datetime:
    try:
        return moment.replace(year=moment.year + 1)
    except ValueError:  # 29 February
        return moment.replace(year=moment.year + 1, day=28)


def _sync_subscription_from_transaction(user_id: str, transaction: dict[str, Any]) -> None:
    """The first annual charge opens the period right away; renewals arrive by webhook."""
    paid_at = _parse_time(transaction.get("paid_at")) or datetime.now(timezone.utc)
    customer = transaction.get("customer")
    customer = customer if isinstance(customer, dict) else {}
    rows = _rest(
        "monitoring_subscriptions",
        method="GET",
        query=f"?select=status,current_period_end&user_id=eq.{_eq(user_id)}&limit=1",
    )
    current = rows[0] if rows else None
    end = _parse_time(current.get("current_period_end")) if current else None
    if current and end and end >= paid_at and current["status"] in LIVE_SUBSCRIPTION_STATUSES:
        return  # already recorded by the other path
    _upsert_subscription(
        user_id,
        {
            "status": "active",
            "provider_customer_code": customer.get("customer_code"),
            "current_period_start": paid_at.isoformat(),
            "current_period_end": _add_year(paid_at).isoformat(),
            "cancel_at_period_end": False,
            "last_payment_status": "paid",
        },
    )


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


# --- Webhook -------------------------------------------------------------------


def _event_key(event: dict[str, Any], raw_body: bytes) -> str:
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    ident = data.get("id") or data.get("subscription_code") or data.get("reference") or ""
    digest = hashlib.sha256(raw_body).hexdigest()[:16]
    return f"{event.get('event')}:{ident}:{digest}"


def _user_for_subscription(data: dict[str, Any]) -> str | None:
    code = data.get("subscription_code")
    if isinstance(code, str):
        rows = _rest(
            "monitoring_subscriptions",
            method="GET",
            query=f"?select=user_id&provider_subscription_code=eq.{_eq(code)}&limit=1",
        )
        if rows:
            return rows[0]["user_id"]
    customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}
    customer_code = customer.get("customer_code")
    if isinstance(customer_code, str):
        rows = _rest(
            "monitoring_subscriptions",
            method="GET",
            query=f"?select=user_id&provider_customer_code=eq.{_eq(customer_code)}&limit=1",
        )
        if rows:
            return rows[0]["user_id"]
    return None


def handle_webhook(raw_body: bytes, signature: str | None) -> dict[str, str]:
    if not verify_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature.")
    try:
        event = json.loads(raw_body.decode("utf-8"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload.") from None
    if not isinstance(event, dict) or not isinstance(event.get("event"), str):
        raise HTTPException(status_code=400, detail="Invalid payload.")
    kind = event["event"]
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    event_key = _event_key(event, raw_body)
    try:
        _rest(
            "billing_webhook_events",
            method="POST",
            body={"event_key": event_key, "event_type": kind},
        )
    except _Conflict:
        return {"status": "duplicate"}

    try:
        _process_event(kind, data)
    except Exception:
        # Let the provider retry: forget the delivery so the retry is processed.
        _rest("billing_webhook_events", method="DELETE", query=f"?event_key=eq.{_eq(event_key)}")
        raise
    return {"status": "ok"}


def _process_event(kind: str, data: dict[str, Any]) -> None:
    if kind == "charge.success":
        status = apply_transaction(data)
        reference = data.get("reference")
        purchase = _load_purchase(reference) if isinstance(reference, str) else None
        if status == "succeeded" and purchase and purchase["product"] == "annual_monitoring":
            _sync_subscription_from_transaction(purchase["user_id"], data)
    elif kind == "subscription.create":
        user_id = _user_for_subscription(data)
        if not user_id:
            # The first charge has not been recorded yet; ask Paystack to retry.
            raise HTTPException(status_code=503, detail="Subscription not ready.")
        _upsert_subscription(
            user_id,
            {
                "status": "active",
                "provider_subscription_code": data.get("subscription_code"),
                "provider_email_token": data.get("email_token"),
                "current_period_end": data.get("next_payment_date"),
                "cancel_at_period_end": False,
            },
        )
    elif kind in ("subscription.not_renew", "subscription.disable"):
        user_id = _user_for_subscription(data)
        if user_id:
            _upsert_subscription(
                user_id,
                {
                    "status": "non_renewing" if kind.endswith("not_renew") else "cancelled",
                    "cancel_at_period_end": True,
                },
            )
    elif kind == "invoice.payment_failed":
        subscription = data.get("subscription") if isinstance(data.get("subscription"), dict) else data
        user_id = _user_for_subscription(subscription)
        if user_id:
            _upsert_subscription(user_id, {"status": "attention", "last_payment_status": "failed"})
    elif kind == "invoice.update" and data.get("paid") is True:
        subscription = data.get("subscription") if isinstance(data.get("subscription"), dict) else {}
        user_id = _user_for_subscription(subscription)
        if user_id:
            _upsert_subscription(
                user_id,
                {
                    "status": "active",
                    "last_payment_status": "paid",
                    "current_period_end": subscription.get("next_payment_date"),
                },
            )
    elif kind == "refund.processed":
        reference = data.get("transaction_reference")
        if isinstance(reference, str):
            _rest(
                "billing_purchases",
                method="PATCH",
                query=f"?reference=eq.{_eq(reference)}&status=eq.succeeded",
                body={"status": "refunded", "refunded_at": _now(), "updated_at": _now()},
            )


def cancel_monitoring(user_id: str) -> dict[str, Any]:
    rows = _rest(
        "monitoring_subscriptions",
        method="GET",
        query=(
            "?select=provider_subscription_code,provider_email_token,status"
            f"&user_id=eq.{_eq(user_id)}&limit=1"
        ),
    )
    row = rows[0] if rows else None
    if not row or row["status"] not in ("active", "attention"):
        raise HTTPException(status_code=409, detail="There is no active monitoring plan to cancel.")
    if not row.get("provider_subscription_code") or not row.get("provider_email_token"):
        raise HTTPException(
            status_code=409, detail="Your plan is still being set up. Try again shortly."
        )
    _paystack(
        "/subscription/disable",
        method="POST",
        body={"code": row["provider_subscription_code"], "token": row["provider_email_token"]},
    )
    _upsert_subscription(user_id, {"status": "non_renewing", "cancel_at_period_end": True})
    return load_entitlements(user_id)
