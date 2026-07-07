from __future__ import annotations

from app.models_db import AuditLog
from conftest import auth_headers


def _registered_token(client, email: str) -> str:
    response = client.post(
        "/v1/auth/register", json={"email": email, "password": "Password123!"}
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def test_analyze_accepts_strict_request_schema(client):
    response = client.post(
        "/v1/analyze",
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
            ],
            "context": {"source": "pytest"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert 0 <= body["financial_health_score"] <= 100
    assert body["health_band"] in {"green", "yellow", "red"}
    assert isinstance(body["money_leaks"], list)


def test_analyze_rejects_legacy_raw_list_shape(client):
    response = client.post(
        "/v1/analyze",
        json=[
            {
                "id": "txn-1",
                "timestamp": "2026-06-15T12:00:00Z",
                "amount": -99.5,
            }
        ],
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_freeze_persists_for_authenticated_user(client, db_session, test_email):
    token = _registered_token(client, test_email)

    freeze_response = client.post(
        "/v1/freeze",
        headers=auth_headers(token),
        json={"leak_id": "leak-1", "reason": "pytest freeze"},
    )
    assert freeze_response.status_code == 200

    frozen_response = client.get("/v1/frozen", headers=auth_headers(token))
    assert frozen_response.status_code == 200
    frozen_items = frozen_response.json()["items"]
    assert any(
        item["leak_id"] == "leak-1" and item["reason"] == "pytest freeze"
        for item in frozen_items
    )
    assert (
        db_session.query(AuditLog)
        .filter(
            AuditLog.event_type == "freeze_created",
            AuditLog.event_metadata["leak_id"].as_string() == "leak-1",
        )
        .count()
        == 1
    )


def test_freeze_requires_identifier(client, db_session, test_email):
    token = _registered_token(client, test_email)

    response = client.post(
        "/v1/freeze", headers=auth_headers(token), json={"reason": "missing id"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_link_account_writes_consent_change_audit(client, db_session, test_email):
    token = _registered_token(client, test_email)

    response = client.post(
        "/v1/accounts/link",
        headers=auth_headers(token),
        json={
            "bank_name": "Pytest Bank",
            "account_id": f"{test_email}-account",
            "open_banking_consent_id": "pytest-consent",
            "metadata": {"source": "pytest"},
        },
    )

    assert response.status_code == 201
    assert (
        db_session.query(AuditLog)
        .filter(
            AuditLog.event_type == "consent_changed",
            AuditLog.event_metadata["action"].as_string() == "account_linked",
            AuditLog.event_metadata["has_open_banking_consent"].as_boolean().is_(True),
        )
        .count()
        == 1
    )
