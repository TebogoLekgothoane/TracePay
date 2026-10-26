import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, unquote

import pytest
from fastapi import HTTPException

from app import billing

USER = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
SECRET = "sk_test_secret"


class FakeDb:
    """Minimal PostgREST stand-in: eq. filters, POST uniqueness, PATCH, DELETE."""

    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {
            "billing_purchases": [],
            "monitoring_subscriptions": [],
            "billing_webhook_events": [],
        }

    def rest(self, table: str, *, method: str, query: str = "", body: Any = None) -> list[dict[str, Any]]:
        rows = self.tables[table]
        filters = {k: unquote(v[0])[3:] for k, v in parse_qs(query.lstrip("?")).items() if v[0].startswith("eq.")}
        match = [r for r in rows if all(str(r.get(k)) == v for k, v in filters.items())]
        if method == "GET":
            return [dict(r) for r in match]
        if method == "POST":
            if table == "billing_purchases":
                live = [
                    r for r in rows
                    if (r["user_id"], r["product"], r["analysis_key"]) == (body["user_id"], body["product"], body["analysis_key"])
                    and r["status"] in ("pending", "succeeded")
                ]
                if live or any(r["reference"] == body["reference"] for r in rows):
                    raise billing._Conflict
                row = {"status": "pending", "authorization_url": None, "paid_at": None,
                       "created_at": datetime.now(timezone.utc).isoformat(), **body}
            elif table == "billing_webhook_events":
                if any(r["event_key"] == body["event_key"] for r in rows):
                    raise billing._Conflict
                row = dict(body)
            else:
                row = {"status": "pending", **body}
            rows.append(row)
            return [row]
        if method == "PATCH":
            for r in match:
                r.update(body)
            return [dict(r) for r in match]
        if method == "DELETE":
            for r in match:
                rows.remove(r)
            return []
        raise AssertionError(method)


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch):
    db = FakeDb()
    paystack_calls: list[tuple[str, str, Any]] = []
    txns: dict[str, dict[str, Any]] = {}

    def fake_paystack(path: str, *, method: str = "GET", body: Any = None) -> dict[str, Any]:
        paystack_calls.append((method, path, body))
        if path == "/transaction/initialize":
            return {"authorization_url": f"https://checkout.paystack.com/{body['reference']}"}
        if path.startswith("/transaction/verify/"):
            return txns.get(path.rsplit("/", 1)[1], {"status": "abandoned"})
        return {}

    monkeypatch.setattr(billing, "_rest", db.rest)
    monkeypatch.setattr(billing, "_paystack", fake_paystack)
    monkeypatch.setattr(billing, "_fetch_user_email", lambda _t: "a@example.com")
    monkeypatch.setattr(billing.settings, "paystack_secret_key", SECRET)
    monkeypatch.setattr(billing.settings, "paystack_plan_code", "PLN_test")
    monkeypatch.setattr(billing.settings, "full_analysis_price_cents", 3900)
    monkeypatch.setattr(billing.settings, "monitoring_price_cents", 29900)
    return db, paystack_calls, txns


def checkout(product: str = "full_analysis", user: str = USER) -> dict[str, Any]:
    return billing.create_checkout(user, "token", billing.CheckoutRequest(product=product))


def success(reference: str, amount: int = 3900, **extra: Any) -> dict[str, Any]:
    return {"reference": reference, "status": "success", "amount": amount, "currency": "ZAR", "id": 99,
            "paid_at": datetime.now(timezone.utc).isoformat(), "customer": {"customer_code": "CUS_1"}, **extra}


def test_nothing_unlocked_before_provider_confirms(env) -> None:
    result = checkout()
    assert result["status"] == "pending"
    assert billing.load_entitlements(USER)["full_analysis"]["unlocked"] is False


def test_checkout_is_idempotent(env) -> None:
    db, calls, _ = env
    first, second = checkout(), checkout()
    assert first["reference"] == second["reference"]
    assert len(db.tables["billing_purchases"]) == 1
    assert sum(1 for c in calls if c[1] == "/transaction/initialize") == 1


def test_verify_unlocks_and_never_charges_twice(env) -> None:
    _, _, txns = env
    reference = checkout()["reference"]
    txns[reference] = success(reference)
    assert billing.verify_reference(USER, reference)["entitlements"]["full_analysis"]["unlocked"] is True
    assert checkout()["status"] == "already_owned"


def test_wrong_amount_is_rejected(env) -> None:
    _, _, txns = env
    reference = checkout()["reference"]
    txns[reference] = success(reference, amount=100)
    result = billing.verify_reference(USER, reference)
    assert result["status"] == "failed"
    assert result["entitlements"]["full_analysis"]["unlocked"] is False


def test_failed_payment_allows_retry(env) -> None:
    _, _, txns = env
    reference = checkout()["reference"]
    txns[reference] = {"reference": reference, "status": "failed", "gateway_response": "Declined"}
    assert billing.verify_reference(USER, reference)["status"] == "failed"
    retry = checkout()
    assert retry["status"] == "pending" and retry["reference"] != reference


def test_other_users_cannot_verify_a_reference(env) -> None:
    reference = checkout()["reference"]
    with pytest.raises(HTTPException) as error:
        billing.verify_reference(OTHER, reference)
    assert error.value.status_code == 404


def test_monitoring_requires_the_full_analysis(env) -> None:
    with pytest.raises(HTTPException) as error:
        checkout("annual_monitoring")
    assert error.value.status_code == 409


def test_annual_monitoring_flow_and_expiry(env) -> None:
    db, _, txns = env
    db.tables["billing_purchases"].append(
        {"user_id": USER, "product": "full_analysis", "analysis_key": "primary", "reference": "tp_done",
         "status": "succeeded", "amount_cents": 3900, "currency": "ZAR", "paid_at": "2026-10-01T00:00:00+00:00",
         "created_at": "2026-10-01T00:00:00+00:00"}
    )
    reference = checkout("annual_monitoring")["reference"]
    txns[reference] = success(reference, amount=29900)
    entitlements = billing.verify_reference(USER, reference)["entitlements"]
    assert entitlements["monitoring"]["active"] is True

    db.tables["monitoring_subscriptions"][0]["current_period_end"] = (
        datetime.now(timezone.utc) - timedelta(days=1)
    ).isoformat()
    expired = billing.load_entitlements(USER)["monitoring"]
    assert expired["active"] is False and expired["status"] == "expired"


def sign(body: bytes) -> str:
    return hmac.new(SECRET.encode(), body, hashlib.sha512).hexdigest()


def test_webhook_rejects_bad_signature(env) -> None:
    body = json.dumps({"event": "charge.success", "data": {}}).encode()
    with pytest.raises(HTTPException) as error:
        billing.handle_webhook(body, "nope")
    assert error.value.status_code == 401


def test_webhook_unlocks_once_and_ignores_duplicates(env) -> None:
    reference = checkout()["reference"]
    body = json.dumps({"event": "charge.success", "data": success(reference)}).encode()
    assert billing.handle_webhook(body, sign(body)) == {"status": "ok"}
    assert billing.handle_webhook(body, sign(body)) == {"status": "duplicate"}
    assert billing.load_entitlements(USER)["full_analysis"]["unlocked"] is True


def test_refund_revokes_access(env) -> None:
    _, _, txns = env
    reference = checkout()["reference"]
    txns[reference] = success(reference)
    billing.verify_reference(USER, reference)
    body = json.dumps({"event": "refund.processed", "data": {"transaction_reference": reference}}).encode()
    billing.handle_webhook(body, sign(body))
    assert billing.load_entitlements(USER)["full_analysis"]["unlocked"] is False


def test_failed_webhook_processing_can_be_retried(env, monkeypatch: pytest.MonkeyPatch) -> None:
    db, _, _ = env
    body = json.dumps({"event": "subscription.create", "data": {"subscription_code": "SUB_1"}}).encode()
    with pytest.raises(HTTPException):
        billing.handle_webhook(body, sign(body))
    assert db.tables["billing_webhook_events"] == []


def test_cancel_marks_non_renewing(env) -> None:
    db, _, _ = env
    db.tables["monitoring_subscriptions"].append(
        {"user_id": USER, "status": "active", "provider_subscription_code": "SUB_1",
         "provider_email_token": "tok", "current_period_end": (datetime.now(timezone.utc) + timedelta(days=200)).isoformat()}
    )
    result = billing.cancel_monitoring(USER)
    assert result["monitoring"]["cancel_at_period_end"] is True
    assert result["monitoring"]["active"] is True  # paid period still runs


def test_phone_only_account_must_supply_a_valid_email(env, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(billing, "_fetch_user_email", lambda _t: None)
    with pytest.raises(HTTPException) as missing:
        billing.create_checkout(USER, "token", billing.CheckoutRequest(product="full_analysis"))
    assert missing.value.status_code == 422
    assert missing.value.detail["code"] == "email_required"

    with pytest.raises(HTTPException) as bad:
        billing.create_checkout(USER, "token", billing.CheckoutRequest(product="full_analysis", email="nope"))
    assert bad.value.detail["code"] == "email_required"

    _, calls, _ = env
    ok = billing.create_checkout(
        USER, "token", billing.CheckoutRequest(product="full_analysis", email="me@example.com")
    )
    assert ok["status"] == "pending"
    init = next(body for method, path, body in calls if path == "/transaction/initialize")
    assert init["email"] == "me@example.com"
