from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, unquote

import pytest
from fastapi import HTTPException

from app import billing, revenuecat

USER = "11111111-1111-1111-1111-111111111111"
SECRET = "rc_webhook_secret"


class FakeDb:
    """Minimal PostgREST stand-in: eq./in./like. filters, POST uniqueness, PATCH."""

    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {
            "billing_purchases": [],
            "monitoring_subscriptions": [],
        }

    @staticmethod
    def _matches(row: dict[str, Any], key: str, spec: str) -> bool:
        value = str(row.get(key))
        if spec.startswith("eq."):
            return value == spec[3:]
        if spec.startswith("in."):
            return value in spec[4:-1].split(",")
        if spec.startswith("like."):
            return value.startswith(spec[5:].rstrip("*"))
        return True

    def rest(self, table: str, *, method: str, query: str = "", body: Any = None) -> list[dict[str, Any]]:
        rows = self.tables[table]
        params = {k: unquote(v[0]) for k, v in parse_qs(query.lstrip("?")).items()}
        filters = {k: v for k, v in params.items() if k not in ("select", "order", "limit")}
        match = [r for r in rows if all(self._matches(r, k, v) for k, v in filters.items())]
        if method == "GET":
            return [dict(r) for r in match]
        if method == "POST":
            if table == "billing_purchases":
                live = [
                    r for r in rows
                    if (r["user_id"], r["product"], r["analysis_key"])
                    == (body["user_id"], body["product"], body["analysis_key"])
                    and r["status"] in ("pending", "succeeded")
                ]
                if live or any(r["reference"] == body["reference"] for r in rows):
                    raise billing._Conflict
            row = {"created_at": datetime.now(timezone.utc).isoformat(), **body}
            rows.append(row)
            return [row]
        if method == "PATCH":
            for r in match:
                r.update(body)
            return [dict(r) for r in match]
        raise AssertionError(method)


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch):
    db = FakeDb()
    subscriber: dict[str, Any] = {}
    monkeypatch.setattr(billing, "_rest", db.rest)
    monkeypatch.setattr(revenuecat, "_fetch_subscriber", lambda _user: subscriber)
    monkeypatch.setattr(revenuecat.settings, "revenuecat_webhook_secret", SECRET)
    monkeypatch.setattr(revenuecat.settings, "revenuecat_full_analysis_product_id", "full_id")
    monkeypatch.setattr(revenuecat.settings, "revenuecat_monitoring_product_id", "annual_id")
    monkeypatch.setattr(billing.settings, "full_analysis_price_cents", 4900)
    monkeypatch.setattr(billing.settings, "monitoring_price_cents", 29900)
    return db, subscriber


def _iso(delta_days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=delta_days)).isoformat()


def test_launch_prices_are_r49_once_off_and_r299_a_year() -> None:
    products = billing.products_payload()
    assert products["full_analysis"]["price_cents"] == 4900  # type: ignore[index]
    assert products["annual_monitoring"]["price_cents"] == 29900  # type: ignore[index]


def test_nothing_unlocked_without_a_store_purchase(env) -> None:
    result = revenuecat.sync_subscriber(USER)
    assert result["full_analysis"]["unlocked"] is False
    assert result["monitoring"]["status"] == "none"


def test_full_analysis_purchase_unlocks_once(env) -> None:
    db, subscriber = env
    subscriber["non_subscriptions"] = {
        "full_id": [{"id": "a1", "store_transaction_id": "T1", "purchase_date": _iso(-1)}]
    }
    assert revenuecat.sync_subscriber(USER)["full_analysis"]["unlocked"] is True
    revenuecat.sync_subscriber(USER)  # idempotent
    assert len(db.tables["billing_purchases"]) == 1
    assert db.tables["billing_purchases"][0]["amount_cents"] == 4900


def test_annual_subscription_bundles_full_analysis(env) -> None:
    db, subscriber = env
    subscriber["subscriptions"] = {
        "annual_id": {
            "purchase_date": _iso(-10),
            "original_purchase_date": _iso(-10),
            "expires_date": _iso(355),
        }
    }
    result = revenuecat.sync_subscriber(USER)
    assert result["monitoring"]["active"] is True
    assert result["monitoring"]["status"] == "active"
    assert result["full_analysis"]["unlocked"] is True
    assert db.tables["billing_purchases"][0]["amount_cents"] == 29900


def test_unsubscribe_and_billing_issue_states(env) -> None:
    _, subscriber = env
    sub = {"purchase_date": _iso(-10), "original_purchase_date": _iso(-10), "expires_date": _iso(355)}
    subscriber["subscriptions"] = {"annual_id": {**sub, "unsubscribe_detected_at": _iso(-1)}}
    result = revenuecat.sync_subscriber(USER)
    assert result["monitoring"]["status"] == "non_renewing"
    assert result["monitoring"]["cancel_at_period_end"] is True
    assert result["monitoring"]["active"] is True
    subscriber["subscriptions"] = {"annual_id": {**sub, "billing_issues_detected_at": _iso(-1)}}
    assert revenuecat.sync_subscriber(USER)["monitoring"]["status"] == "attention"


def test_expired_subscription_is_not_active_but_analysis_stays(env) -> None:
    _, subscriber = env
    subscriber["subscriptions"] = {
        "annual_id": {"purchase_date": _iso(-400), "original_purchase_date": _iso(-400), "expires_date": _iso(-35)}
    }
    # The bundled unlock was granted by the earlier in-term sync.
    revenuecat._record_purchase(USER, "annual_monitoring", "rc_x", _iso(-400), None)
    result = revenuecat.sync_subscriber(USER)
    assert result["monitoring"]["active"] is False
    assert result["monitoring"]["status"] == "expired"
    assert result["full_analysis"]["unlocked"] is True


def test_refund_revokes_store_purchase(env) -> None:
    _, subscriber = env
    subscriber["non_subscriptions"] = {
        "full_id": [{"id": "a1", "store_transaction_id": "T1", "purchase_date": _iso(-1)}]
    }
    assert revenuecat.sync_subscriber(USER)["full_analysis"]["unlocked"] is True
    subscriber["non_subscriptions"] = {}
    assert revenuecat.sync_subscriber(USER)["full_analysis"]["unlocked"] is False


def test_webhook_requires_secret_and_only_syncs_known_users(env) -> None:
    with pytest.raises(HTTPException):
        revenuecat.handle_webhook("wrong", b"{}")
    anonymous = b'{"event": {"app_user_id": "$RCAnonymousID:abc"}}'
    assert revenuecat.handle_webhook(SECRET, anonymous) == {"status": "ignored"}
    known = ('{"event": {"app_user_id": "%s"}}' % USER).encode()
    assert revenuecat.handle_webhook(f"Bearer {SECRET}", known) == {"status": "ok"}
