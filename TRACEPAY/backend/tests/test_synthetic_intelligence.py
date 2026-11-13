"""Development-only synthetic intelligence routes stay off the production path."""

from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.config import settings
from app.main import app
from leak_intelligence.engine import build_financial_features

AUTH = {"Authorization": "Bearer test-token"}


def _enable(monkeypatch) -> None:
    monkeypatch.setattr(settings, "tracepay_env", "development")
    monkeypatch.setattr(settings, "synthetic_intelligence_debug", True)


def _disable(monkeypatch) -> None:
    monkeypatch.setattr(settings, "tracepay_env", "production")
    monkeypatch.setattr(settings, "synthetic_intelligence_debug", False)


def _allow_user(monkeypatch, user_id: str = "user-real") -> None:
    monkeypatch.setattr("app.auth._fetch_supabase_user_id", lambda _token: user_id)


def test_debug_routes_are_hidden_outside_development(monkeypatch) -> None:
    _disable(monkeypatch)
    calls = {"count": 0}

    def reject(_token: str) -> str:
        calls["count"] += 1
        return "user-real"

    monkeypatch.setattr("app.auth._fetch_supabase_user_id", reject)
    client = TestClient(app)
    listing = client.get("/debug/intelligence-scenarios", headers=AUTH)
    analysis = client.get(
        "/debug/intelligence-scenarios/FI-029-fast-food-escalation/analysis",
        headers=AUTH,
    )
    assert listing.status_code == 404
    assert analysis.status_code == 404
    assert calls["count"] == 0


def test_production_environment_stays_closed_even_if_the_flag_is_set(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "tracepay_env", "production")
    monkeypatch.setattr(settings, "synthetic_intelligence_debug", True)
    assert (
        TestClient(app).get("/debug/intelligence-scenarios", headers=AUTH).status_code
        == 404
    )


def test_development_without_the_flag_stays_closed(monkeypatch) -> None:
    monkeypatch.setattr(settings, "tracepay_env", "development")
    monkeypatch.setattr(settings, "synthetic_intelligence_debug", False)
    assert (
        TestClient(app).get("/debug/intelligence-scenarios", headers=AUTH).status_code
        == 404
    )


def test_enabled_route_requires_authentication(monkeypatch) -> None:
    _enable(monkeypatch)
    assert TestClient(app).get("/debug/intelligence-scenarios").status_code == 401


def test_catalog_lists_manifest_scenarios_without_transactions(monkeypatch) -> None:
    _enable(monkeypatch)
    _allow_user(monkeypatch)
    response = TestClient(app).get("/debug/intelligence-scenarios", headers=AUTH)
    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset"] == "tracepay-intelligence-v1"
    assert payload["currency"] == "ZAR"
    ids = [item["scenario_id"] for item in payload["scenarios"]]
    assert "FI-029-fast-food-escalation" in ids
    assert "single-restaurant-meal" in ids
    assert "transactions_file" not in response.text
    assert "POS PURCHASE" not in response.text


def test_unknown_scenario_is_rejected(monkeypatch) -> None:
    _enable(monkeypatch)
    _allow_user(monkeypatch)
    response = TestClient(app).get(
        "/debug/intelligence-scenarios/FI-999-not-in-manifest/analysis",
        headers=AUTH,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown intelligence scenario."


def test_analysis_uses_the_existing_pipeline_and_not_supabase(monkeypatch) -> None:
    _enable(monkeypatch)
    _allow_user(monkeypatch, "authenticated-user")

    def reject_storage(*_args, **_kwargs):
        raise AssertionError("Synthetic analysis must not read Supabase.")

    monkeypatch.setattr(
        "app.financial_features._fetch_transaction_rows", reject_storage
    )
    response = TestClient(app).get(
        "/debug/intelligence-scenarios/FI-029-fast-food-escalation/analysis",
        headers=AUTH,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["scenario_id"] == "FI-029-fast-food-escalation"
    assert payload["leaks"]["user_id"] == "synthetic-intelligence-user"
    assert payload["leaks"]["user_id"] != "authenticated-user"
    assert "food_spending_leak" in {
        item["leak_type"] for item in payload["leaks"]["leaks"]
    }
    assert payload["features"]["transaction_count"] > 0
    assert isinstance(payload["behaviour"]["observations"], list)
    assert isinstance(payload["reasoning"]["analyses"], list)
    assert isinstance(payload["recommendations"]["recommendations"], list)
    assert "POS PURCHASE" not in response.text


def test_negative_scenario_does_not_report_the_absent_leak(monkeypatch) -> None:
    _enable(monkeypatch)
    _allow_user(monkeypatch)
    response = TestClient(app).get(
        "/debug/intelligence-scenarios/single-restaurant-meal/analysis",
        headers=AUTH,
    )
    assert response.status_code == 200
    leak_types = {item["leak_type"] for item in response.json()["leaks"]["leaks"]}
    assert "food_spending_leak" not in leak_types


def test_client_cannot_post_transaction_payloads(monkeypatch) -> None:
    _enable(monkeypatch)
    _allow_user(monkeypatch)
    response = TestClient(app).post(
        "/debug/intelligence-scenarios/FI-029-fast-food-escalation/analysis",
        headers=AUTH,
        json={"transactions": [{"amount": "1.00"}]},
    )
    assert response.status_code == 405


def test_production_features_endpoint_ignores_a_scenario_query(monkeypatch) -> None:
    app.dependency_overrides[require_supabase_user] = lambda: "user-real"

    async def real_snapshot(user_id: str, token: str):
        assert user_id == "user-real"
        assert token == "test-token"
        return build_financial_features(user_id, [])

    monkeypatch.setattr("app.main.build_user_feature_snapshot", real_snapshot)
    try:
        response = TestClient(app).get(
            "/financial-features",
            params={"scenario": "FI-029-fast-food-escalation"},
            headers=AUTH,
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["transaction_count"] == 0
    assert "FI-029" not in response.text
    assert "food_spending_leak" not in response.text
