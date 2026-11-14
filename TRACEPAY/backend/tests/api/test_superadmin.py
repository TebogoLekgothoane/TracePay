from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import superadmin_metrics
from app.config import settings
from app.rate_limit import _hits
from app.superadmin_metrics import Snapshot, build_metrics
from app.superadmin_routes import router

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
TOKEN = "t" * 40


def _iso(delta: timedelta) -> str:
    return (NOW - delta).isoformat()


def _snapshot() -> Snapshot:
    users = [
        {"id": "u1", "email": "alice@example.com", "phone": "", "email_confirmed_at": _iso(timedelta(hours=2)), "created_at": _iso(timedelta(hours=2)), "last_sign_in_at": _iso(timedelta(hours=1))},
        {"id": "u2", "email": "", "phone": "+27821234567", "phone_confirmed_at": None, "created_at": _iso(timedelta(days=3)), "last_sign_in_at": None},
        {"id": "u3", "email": "carol@example.com", "phone": "", "email_confirmed_at": _iso(timedelta(days=40)), "created_at": _iso(timedelta(days=40)), "last_sign_in_at": _iso(timedelta(days=40))},
    ]
    imports = [
        {"user_id": "u1", "status": "processed", "extraction_method": "text", "error_message": None, "transaction_count": 40, "created_at": _iso(timedelta(hours=1))},
        {"user_id": "u2", "status": "failed", "extraction_method": "unknown", "error_message": "Password is wrong\n  for this file", "transaction_count": 0, "created_at": _iso(timedelta(days=2))},
        {"user_id": "u2", "status": "failed", "extraction_method": "unknown", "error_message": None, "transaction_count": 0, "created_at": _iso(timedelta(days=2))},
        {"user_id": "u2", "status": "failed", "extraction_method": "unknown", "error_message": "Password is wrong for this file", "transaction_count": 0, "created_at": _iso(timedelta(days=2))},
    ]
    purchases = [
        {"user_id": "u1", "product": "full_analysis", "status": "succeeded", "amount_cents": 4900, "paid_at": _iso(timedelta(hours=1)), "refunded_at": None, "created_at": _iso(timedelta(hours=1))},
        {"user_id": "u3", "product": "annual_monitoring", "status": "succeeded", "amount_cents": 29900, "paid_at": _iso(timedelta(days=40)), "refunded_at": None, "created_at": _iso(timedelta(days=40))},
        {"user_id": "u2", "product": "full_analysis", "status": "refunded", "amount_cents": 4900, "paid_at": _iso(timedelta(days=2)), "refunded_at": _iso(timedelta(days=1)), "created_at": _iso(timedelta(days=2))},
        {"user_id": "u2", "product": "full_analysis", "status": "pending", "amount_cents": 4900, "paid_at": None, "refunded_at": None, "created_at": _iso(timedelta(days=1))},
    ]
    subscriptions = [
        {"user_id": "u3", "status": "active", "current_period_end": _iso(timedelta(days=-300)), "cancel_at_period_end": False, "created_at": _iso(timedelta(days=40))},
    ]
    return Snapshot(
        users=users,
        statement_imports=imports,
        purchases=purchases,
        subscriptions=subscriptions,
        answer_rows=[{"user_id": "u1", "answered_at": _iso(timedelta(minutes=30))}],
        waitlist=[
            {"email": "w@example.com", "interests": ["individual", "business"], "source": "website", "created_at": _iso(timedelta(days=5))},
        ],
        budget_rows=[{"user_id": "u1", "used": 12, "window_start": _iso(timedelta(hours=1))}],
        transaction_count=40,
    )


def _build(days: int = 30) -> dict:
    return build_metrics(
        _snapshot(),
        days=days,
        now=NOW,
        full_price_cents=4900,
        monitoring_price_cents=29900,
    )


def test_registrations_and_series_cover_the_range():
    payload = _build(days=7)
    registrations = payload["registrations"]
    assert registrations["total"] == 3
    assert registrations["new_7d"] == 2
    assert registrations["active_7d"] == 1
    # u2 never signed in again; u3 only ever signed in at creation.
    assert registrations["signed_up_once"] == 2
    assert len(registrations["signups"]["labels"]) == 7
    assert sum(registrations["signups"]["values"]) == 2


def test_revenue_counts_only_succeeded_purchases():
    sales = _build()["sales"]
    assert sales["revenue_all_zar"] == 49.0 + 299.0
    assert sales["refunded_count"] == 1
    assert sales["refunded_zar"] == 49.0
    assert sales["by_product"]["full_analysis"] == {"count": 1, "revenue_zar": 49.0}
    assert sales["by_product"]["annual_monitoring"] == {"count": 1, "revenue_zar": 299.0}
    assert sales["paying_users"] == 2
    # One live annual monitoring subscription (period ends in the future) at R299 a year.
    assert sales["monitoring_live"] == 1
    assert sales["monitoring_value_zar"] == 299.0


def test_funnel_is_distinct_users_per_step():
    funnel = {step["stage"]: step["count"] for step in _build()["funnel"]}
    assert funnel == {
        "Account created": 3,
        "Phone verified": 2,
        "Uploaded a statement": 2,
        "Statement processed": 1,
        "Answered a finding question": 1,
        "Paying": 2,
    }


def test_failure_reasons_are_cleaned_and_grouped():
    reasons = _build()["statements"]["failure_reasons"]
    assert reasons[0] == {"reason": "Password is wrong for this file", "count": 2}
    assert {"reason": "No message recorded", "count": 1} in reasons


def test_contacts_are_masked_in_every_list():
    payload = _build()
    rendered = repr(payload)
    assert "alice@example.com" not in rendered
    assert "carol@example.com" not in rendered
    assert "+27821234567" not in rendered
    assert "al***@example.com" in rendered


def test_alerts_flag_failing_statements_and_truncation():
    snapshot = _snapshot()
    snapshot.statement_imports = snapshot.statement_imports * 2
    snapshot.truncated = ["statement_imports"]
    payload = build_metrics(snapshot, days=30, now=NOW, full_price_cents=4900, monitoring_price_cents=29900)
    texts = [alert["text"] for alert in payload["alerts"]]
    assert any("failed in this range" in text for text in texts)
    assert any("hit the" in text for text in texts)


def test_waitlist_totals_and_interests():
    waitlist = _build()["waitlist"]
    assert waitlist["total"] == 1
    assert waitlist["interests"] == {"individual": 1, "business": 1}
    assert waitlist["cumulative"]["values"][-1] == 1


def _ai_event(feature, model, outcome, prompt, completion, *, items=10, hours=1, ms=800, provider="openrouter"):
    return {
        "feature": feature, "provider": provider, "model": model, "outcome": outcome,
        "items": items, "prompt_tokens": prompt, "completion_tokens": completion,
        "total_tokens": prompt + completion, "duration_ms": ms,
        "created_at": _iso(timedelta(hours=hours)),
    }


def test_rates_use_verified_users_not_every_account():
    payload = _build()
    assert payload["registrations"]["total"] == 3
    assert payload["registrations"]["verified"] == 2
    assert payload["registrations"]["unverified"] == 1
    assert payload["kpis"]["registered_total"] == 2
    # Two paying users out of two verified users, not out of three accounts.
    assert payload["sales"]["conversion_pct"] == 100.0
    assert payload["sales"]["arpu_zar"] == round(348 / 2, 2)


def test_skipped_questions_do_not_count_as_answers():
    snapshot = _snapshot()
    snapshot.answer_rows = [
        {"user_id": "u1", "status": "answered", "answered_at": _iso(timedelta(hours=1))},
        {"user_id": "u2", "status": "skipped", "answered_at": _iso(timedelta(hours=1))},
    ]
    payload = build_metrics(snapshot, days=30, now=NOW, full_price_cents=4900, monitoring_price_cents=29900)
    funnel = {step["stage"]: step["count"] for step in payload["funnel"]}
    assert funnel["Answered a finding question"] == 1


def test_cancelled_imports_are_not_failures_and_rate_uses_finished_attempts():
    snapshot = _snapshot()
    now_ago = _iso(timedelta(hours=3))
    snapshot.statement_imports = [
        {"user_id": "u1", "status": "processed", "extraction_method": "text", "error_message": None, "transaction_count": 5, "created_at": now_ago},
        {"user_id": "u1", "status": "failed", "extraction_method": "unknown", "error_message": "PDF processing was cancelled.", "transaction_count": 0, "created_at": now_ago},
        {"user_id": "u1", "status": "failed", "extraction_method": "unknown", "error_message": "Unsupported layout", "transaction_count": 0, "created_at": now_ago},
        {"user_id": "u1", "status": "processing", "extraction_method": "unknown", "error_message": None, "transaction_count": 0, "created_at": now_ago},
        {"user_id": "u1", "status": "uploaded", "extraction_method": "unknown", "error_message": None, "transaction_count": 0, "created_at": now_ago},
    ]
    statements = build_metrics(snapshot, days=30, now=NOW, full_price_cents=4900, monitoring_price_cents=29900)["statements"]
    assert statements["in_range"] == 5
    assert statements["cancelled_in_range"] == 1
    assert statements["failure_rate"] == 0.5  # 1 failure out of 2 finished (1 processed + 1 failed)
    assert statements["failure_reasons"] == [{"reason": "Unsupported layout", "count": 1}]


def test_every_user_is_loaded_even_when_the_server_caps_the_page_size(monkeypatch):
    pages = {
        1: [{"id": "a"}, {"id": "b"}],
        2: [{"id": "c"}, {"id": "d"}],
        3: [{"id": "e"}],
    }

    def fake_get(path, *, count=False):
        page = int(path.split("page=")[1].split("&")[0])
        return {"users": pages.get(page, [])}, {}

    monkeypatch.setattr(superadmin_metrics, "_get", fake_get)
    users, truncated = superadmin_metrics._fetch_users()
    assert sorted(user["id"] for user in users) == ["a", "b", "c", "d", "e"]
    assert truncated is False


def test_ai_usage_is_grouped_by_feature_and_model_with_estimated_cost():
    snapshot = _snapshot()
    snapshot.ai_events = [
        _ai_event("transaction_categorisation", "openai/gpt-4o-mini", "success", 1_000_000, 1_000_000, items=50),
        _ai_event("transaction_categorisation", "openai/gpt-4o-mini", "failed", 0, 0, items=50, ms=3000),
        _ai_event("subscription_reason", "some/unpriced-model", "success", 400, 100, items=1),
        _ai_event("subscription_reason", "openai/gpt-4o-mini", "success", 10, 5, hours=24 * 60),  # outside range
    ]
    snapshot.budget_rows = [
        {"user_id": "u1", "used": 500, "window_start": _iso(timedelta(hours=1))},
        {"user_id": "u2", "used": 0, "window_start": _iso(timedelta(hours=1))},
    ]
    ai = build_metrics(
        snapshot, days=30, now=NOW, full_price_cents=4900, monitoring_price_cents=29900, ai_daily_item_limit=2000
    )["ai"]

    assert ai["logging_ready"] is True
    assert ai["total"]["calls"] == 3
    assert ai["total"]["tokens"] == 2_000_000 + 500
    assert ai["total"]["cost_usd"] == 0.75  # 1M input at $0.15 + 1M output at $0.60
    assert ai["total"]["unpriced_tokens"] == 500
    features = {item["feature"]: item for item in ai["by_feature"]}
    assert features["transaction_categorisation"]["calls"] == 2
    assert features["transaction_categorisation"]["success"] == 1
    assert features["transaction_categorisation"]["failed"] == 1
    assert features["transaction_categorisation"]["items"] == 100
    assert features["transaction_categorisation"]["avg_ms"] == 1900
    assert ai["by_feature"][0]["feature"] == "transaction_categorisation"  # most tokens first
    assert {item["model"] for item in ai["by_model"]} == {"openai/gpt-4o-mini", "some/unpriced-model"}
    daily = {item["feature"]: item["values"] for item in ai["series"]["calls_by_feature"]}
    assert sum(daily["transaction_categorisation"]) == 2
    assert ai["budget"]["top_users"] == [{"user": "al***@example.com", "used": 500, "pct_of_limit": 25.0}]


def test_price_overrides_replace_defaults():
    snapshot = _snapshot()
    snapshot.ai_events = [_ai_event("subscription_reason", "some/unpriced-model", "success", 1_000_000, 0)]
    ai = build_metrics(
        snapshot, days=30, now=NOW, full_price_cents=4900, monitoring_price_cents=29900,
        ai_price_overrides='{"some/unpriced-model": [2, 8]}',
    )["ai"]
    assert ai["total"]["cost_usd"] == 2.0
    assert ai["total"]["unpriced_tokens"] == 0


def test_missing_tables_are_reported_not_fatal():
    snapshot = _snapshot()
    snapshot.missing_tables = ["waitlist_signups", "ai_usage_events"]
    payload = build_metrics(snapshot, days=30, now=NOW, full_price_cents=4900, monitoring_price_cents=29900)
    texts = [alert["text"] for alert in payload["alerts"]]
    assert any("waitlist_signups" in t and "202611040001_waitlist_signups.sql" in t for t in texts)
    assert payload["ai"]["logging_ready"] is False
    assert payload["missing_tables"] == ["waitlist_signups", "ai_usage_events"]


def test_a_404_on_a_table_is_a_missing_table(monkeypatch):
    def fake_get(path, *, count=False):
        if "waitlist_signups" in path or "ai_usage_events" in path:
            raise superadmin_metrics.TableMissing(path)
        if path.startswith("/auth/v1/admin/users"):
            return {"users": []}, {}
        if count:
            return [], {"content-range": "*/7"}
        return [], {}

    monkeypatch.setattr(superadmin_metrics, "_get", fake_get)
    snapshot = superadmin_metrics.load_snapshot()
    assert sorted(snapshot.missing_tables) == ["ai_usage_events", "waitlist_signups"]
    assert snapshot.transaction_count == 7
    assert snapshot.waitlist == []


def test_failed_reload_serves_the_last_good_snapshot_flagged_stale(monkeypatch):
    from fastapi import HTTPException

    good = _snapshot()
    good.loaded_at = NOW
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            return good
        raise HTTPException(status_code=503, detail="down")

    monkeypatch.setattr(superadmin_metrics, "load_snapshot", flaky)
    monkeypatch.setitem(superadmin_metrics._cache, "snapshot", None)
    monkeypatch.setitem(superadmin_metrics._cache, "at", None)
    assert superadmin_metrics.get_snapshot(force=True) is good and not good.stale
    again = superadmin_metrics.get_snapshot(force=True)
    assert again is good and good.stale is True
    payload = build_metrics(again, days=30, now=NOW, full_price_cents=4900, monitoring_price_cents=29900)
    assert any("last successful load" in alert["text"] for alert in payload["alerts"])


def test_first_load_failure_is_an_error(monkeypatch):
    from fastapi import HTTPException

    def down():
        raise HTTPException(status_code=503, detail="down")

    monkeypatch.setattr(superadmin_metrics, "load_snapshot", down)
    monkeypatch.setitem(superadmin_metrics._cache, "snapshot", None)
    monkeypatch.setitem(superadmin_metrics._cache, "at", None)
    with pytest.raises(HTTPException):
        superadmin_metrics.get_snapshot(force=True)


def test_usage_rows_carry_tokens_and_never_raise(monkeypatch):
    from app import ai_usage

    sent = []

    class Inline:
        def submit(self, fn, row):
            sent.append(row)

    monkeypatch.setattr(ai_usage, "_executor", Inline())
    payload = {"model": "openai/gpt-4o-mini-2024", "usage": {"prompt_tokens": 12, "completion_tokens": 3}}
    ai_usage.record_ai_usage(
        feature="transaction_categorisation", provider="openrouter", model="fallback",
        outcome="success", items=4, payload=payload, duration_ms=250.7,
    )
    ai_usage.record_ai_usage(feature="x", provider="p", model="m", outcome="bogus")  # ignored
    ai_usage.record_ai_usage(feature="x", provider="p", model="m", outcome="failed", payload="not a dict")
    assert sent[0] == {
        "feature": "transaction_categorisation", "provider": "openrouter", "model": "openai/gpt-4o-mini-2024",
        "outcome": "success", "items": 4, "prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15,
        "duration_ms": 250,
    }
    assert len(sent) == 2
    assert sent[1]["total_tokens"] == 0 and sent[1]["model"] == "m"


def test_categorisation_records_failed_and_rejected_calls(monkeypatch):
    from app import ai_usage
    from categorisation import ai_classifier

    recorded = []
    monkeypatch.setattr(ai_classifier, "record_ai_usage", lambda **kw: recorded.append(kw))
    monkeypatch.setattr(settings, "openrouter_api_key", "test-key")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "xai_api_key", "")
    items = [ai_classifier.AiTransaction("t1", "SOME SHOP", "10.00", "debit")]

    monkeypatch.setattr(ai_classifier, "_request_openrouter", lambda *a: None)
    assert ai_classifier.classify_batch(items, ["Groceries"]) == {}
    assert recorded[-1]["outcome"] == "failed"
    assert recorded[-1]["feature"] == "transaction_categorisation"
    assert recorded[-1]["items"] == 1

    bad = {"usage": {"prompt_tokens": 5, "completion_tokens": 1}, "choices": [{"message": {"content": "not json"}}]}
    monkeypatch.setattr(ai_classifier, "_request_openrouter", lambda *a: bad)
    assert ai_classifier.classify_batch(items, ["Groceries"]) == {}
    assert recorded[-1]["outcome"] == "rejected"
    assert recorded[-1]["payload"] is bad
    assert ai_usage.token_usage(recorded[-1]["payload"]) == (5, 1, 6)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "superadmin_dashboard_token", TOKEN)
    monkeypatch.setattr(superadmin_metrics, "get_snapshot", lambda force=False: _snapshot())
    _hits.clear()
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_the_backend_no_longer_serves_a_page(client):
    assert client.get("/superadmin").status_code == 404


def test_metrics_need_the_operator_token(client):
    assert client.get("/superadmin/api/metrics").status_code == 401
    assert client.get("/superadmin/api/metrics", headers={"X-Superadmin-Token": "wrong"}).status_code == 401


def test_metrics_refuse_when_token_is_missing_or_short(monkeypatch):
    monkeypatch.setattr(settings, "superadmin_dashboard_token", "short")
    app = FastAPI()
    app.include_router(router)
    response = TestClient(app).get("/superadmin/api/metrics", headers={"X-Superadmin-Token": "short"})
    assert response.status_code == 503


def test_metrics_return_payload_with_correct_token(client):
    response = client.get("/superadmin/api/metrics?days=14", headers={"X-Superadmin-Token": TOKEN})
    assert response.status_code == 200
    body = response.json()
    assert body["range_days"] == 14
    assert body["kpis"]["registered_total"] == 2
    assert body["kpis"]["accounts_total"] == 3
    assert body["timezone"].startswith("Africa/Johannesburg")


def test_days_out_of_range_are_rejected(client):
    response = client.get("/superadmin/api/metrics?days=0", headers={"X-Superadmin-Token": TOKEN})
    assert response.status_code == 422
