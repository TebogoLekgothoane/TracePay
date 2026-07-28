from __future__ import annotations

from app.models_db import AnalysisResult
from conftest import create_db_profile, override_current_user


def test_my_summary_with_no_analyses(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.get("/v1/me/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["financial_health_score"] is None
    assert body["leaks_found"] == 0
    assert body["potential_monthly_savings"] == 0.0
    assert body["linked_accounts_count"] == 0
    assert body["frozen_items_count"] == 0


def test_my_summary_reflects_latest_analysis(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    analysis = AnalysisResult(
        user_id=profile.id,
        financial_health_score=72,
        health_band="yellow",
        money_leaks=[
            {"detector": "AirtimeDrain", "title": "Airtime top-ups", "estimated_monthly_cost": 150.0},
            {"detector": "StakeholderMetrics", "inclusion_delta": 3, "retail_velocity": 10},
        ],
        summary_plain_language="Airtime top-ups are draining your account.",
        transaction_count=42,
    )
    db_session.add(analysis)
    db_session.commit()

    response = client.get("/v1/me/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["financial_health_score"] == 72
    assert body["health_band"] == "yellow"
    # StakeholderMetrics is platform metadata, not a real leak -- must not count.
    assert body["leaks_found"] == 1
    assert body["potential_monthly_savings"] == 150.0


def test_my_analyses_only_returns_own_rows(client, db_session):
    mine = create_db_profile(db_session, role="user")
    someone_else = create_db_profile(db_session, role="user")

    db_session.add_all(
        [
            AnalysisResult(
                user_id=mine.id,
                financial_health_score=80,
                health_band="green",
                money_leaks=[],
                summary_plain_language="Looking good.",
                transaction_count=10,
            ),
            AnalysisResult(
                user_id=someone_else.id,
                financial_health_score=20,
                health_band="red",
                money_leaks=[],
                summary_plain_language="Not mine.",
                transaction_count=5,
            ),
        ]
    )
    db_session.commit()

    override_current_user(mine)
    response = client.get("/v1/me/analyses")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["financial_health_score"] == 80


def test_me_routes_require_authorization(client):
    assert client.get("/v1/me/summary").status_code == 403
    assert client.get("/v1/me/analyses").status_code == 403
    assert (
        client.post(
            "/v1/me/analyze",
            json={
                "transactions": [
                    {"id": "t1", "timestamp": "2026-06-15T12:00:00Z", "amount": -10.0}
                ]
            },
        ).status_code
        == 403
    )


def test_analyze_mine_persists_to_my_history(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.post(
        "/v1/me/analyze",
        json={
            "transactions": [
                {
                    "id": "txn-1",
                    "timestamp": "2026-06-15T12:00:00Z",
                    "amount": -99.5,
                    "currency": "ZAR",
                    "description": "Monthly subscription",
                    "merchant": "StreamCo",
                    "direction": "debit",
                }
            ]
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert 0 <= body["financial_health_score"] <= 100

    saved = (
        db_session.query(AnalysisResult)
        .filter(AnalysisResult.user_id == profile.id)
        .one()
    )
    assert saved.id == body["id"]

    summary = client.get("/v1/me/summary").json()
    assert summary["financial_health_score"] == body["financial_health_score"]


def test_my_account_defaults_to_individual(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.get("/v1/me/account")

    assert response.status_code == 200
    assert response.json() == {"account_type": "individual", "business_name": None}


def test_can_set_own_account_to_business(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.put(
        "/v1/me/account",
        json={"account_type": "business", "business_name": "Acme Traders"},
    )

    assert response.status_code == 200
    assert response.json() == {"account_type": "business", "business_name": "Acme Traders"}

    # Persisted, not just echoed back.
    refetched = client.get("/v1/me/account").json()
    assert refetched == {"account_type": "business", "business_name": "Acme Traders"}


def test_account_settings_reject_invalid_account_type(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.put(
        "/v1/me/account",
        json={"account_type": "enterprise", "business_name": "Acme Traders"},
    )

    assert response.status_code == 422
