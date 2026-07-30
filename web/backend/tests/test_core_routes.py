from __future__ import annotations

from app.models_db import AuditLog
from conftest import auth_headers, create_db_profile, supabase_style_token


def _authed_headers(db_session) -> dict[str, str]:
    profile = create_db_profile(db_session, role="user")
    token = supabase_style_token(profile.id, f"{profile.id}@pytest.invalid")
    return auth_headers(token)


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


def test_freeze_persists_for_authenticated_user(client, db_session):
    headers = _authed_headers(db_session)

    freeze_response = client.post(
        "/v1/freeze",
        headers=headers,
        json={"leak_id": "leak-1", "reason": "pytest freeze"},
    )
    assert freeze_response.status_code == 200

    frozen_response = client.get("/v1/frozen", headers=headers)
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


def test_freeze_requires_identifier(client, db_session):
    headers = _authed_headers(db_session)

    response = client.post(
        "/v1/freeze", headers=headers, json={"reason": "missing id"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_link_account_writes_consent_change_audit(client, db_session, test_email):
    headers = _authed_headers(db_session)

    response = client.post(
        "/v1/accounts/link",
        headers=headers,
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


def test_link_account_accepts_branch_label(client, db_session, test_email):
    headers = _authed_headers(db_session)

    response = client.post(
        "/v1/accounts/link",
        headers=headers,
        json={
            "bank_name": "Pytest Bank",
            "account_id": f"{test_email}-branch-account",
            "branch_label": "Cape Town Store",
        },
    )

    assert response.status_code == 201
    assert response.json()["branch_label"] == "Cape Town Store"


def test_link_account_branch_label_defaults_to_none(client, db_session, test_email):
    headers = _authed_headers(db_session)

    response = client.post(
        "/v1/accounts/link",
        headers=headers,
        json={"bank_name": "Pytest Bank", "account_id": f"{test_email}-no-branch"},
    )

    assert response.status_code == 201
    assert response.json()["branch_label"] is None


def test_update_account_branch_retags_existing_account(client, db_session, test_email):
    headers = _authed_headers(db_session)
    link_response = client.post(
        "/v1/accounts/link",
        headers=headers,
        json={"bank_name": "Pytest Bank", "account_id": f"{test_email}-retag"},
    )
    account_id = link_response.json()["id"]

    response = client.put(
        f"/v1/accounts/{account_id}/branch",
        headers=headers,
        json={"branch_label": "Durban Branch"},
    )

    assert response.status_code == 200
    assert response.json()["branch_label"] == "Durban Branch"

    refetched = client.get("/v1/accounts", headers=headers).json()
    matching = next(acc for acc in refetched if acc["id"] == account_id)
    assert matching["branch_label"] == "Durban Branch"


def test_update_account_branch_rejects_other_users_account(client, db_session, test_email):
    owner_headers = _authed_headers(db_session)
    link_response = client.post(
        "/v1/accounts/link",
        headers=owner_headers,
        json={"bank_name": "Pytest Bank", "account_id": f"{test_email}-not-yours"},
    )
    account_id = link_response.json()["id"]

    other_headers = _authed_headers(db_session)
    response = client.put(
        f"/v1/accounts/{account_id}/branch",
        headers=other_headers,
        json={"branch_label": "Should not work"},
    )

    assert response.status_code == 404
