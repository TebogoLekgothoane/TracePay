from __future__ import annotations

import uuid

from app.models_db import AuditLog

from app.models_db import User

from conftest import (
    BrokenCommitSession,
    BrokenQuerySession,
    auth_headers,
    override_db_with,
)


def test_register_login_me_and_refresh(client, db_session, test_email):
    password = "Password123!"

    register_response = client.post(
        "/v1/auth/register",
        json={"email": test_email.upper(), "password": password},
    )

    assert register_response.status_code == 201
    registered = register_response.json()
    assert registered["email"] == test_email
    assert registered["role"] == "user"
    assert registered["access_token"]
    registered_user_id = uuid.UUID(registered["user_id"])
    assert (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "user_created", AuditLog.target_user_id == registered_user_id)
        .count()
        == 1
    )

    saved_user = db_session.query(User).filter(User.email == test_email).first()
    assert saved_user is not None
    assert saved_user.role == "user"

    login_response = client.post(
        "/v1/auth/login",
        json={"email": test_email, "password": password},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    assert (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "login_succeeded", AuditLog.target_user_id == registered_user_id)
        .count()
        == 1
    )

    me_response = client.get("/v1/auth/me", headers=auth_headers(token))
    assert me_response.status_code == 200
    assert me_response.json()["email"] == test_email

    refresh_response = client.post("/v1/auth/refresh", headers=auth_headers(token))
    assert refresh_response.status_code == 200
    assert refresh_response.json()["email"] == test_email
    assert refresh_response.json()["access_token"]


def test_register_rejects_invalid_request(client):
    response = client.post(
        "/v1/auth/register",
        json={"email": "not-an-email", "password": "short", "extra": True},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"


def test_failed_login_writes_audit_event(client, db_session, test_email):
    register_response = client.post(
        "/v1/auth/register",
        json={"email": test_email, "password": "Password123!"},
    )
    assert register_response.status_code == 201

    response = client.post(
        "/v1/auth/login",
        json={"email": test_email, "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert (
        db_session.query(AuditLog)
        .filter(
            AuditLog.event_type == "login_failed",
            AuditLog.target_user_id == uuid.UUID(register_response.json()["user_id"]),
        )
        .count()
        == 1
    )


def test_register_database_query_failure_returns_service_unavailable(client):
    override_db_with(BrokenQuerySession())

    response = client.post(
        "/v1/auth/register",
        json={"email": "query-failure@example.com", "password": "Password123!"},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


def test_register_database_commit_failure_returns_service_unavailable(client):
    override_db_with(BrokenCommitSession())

    response = client.post(
        "/v1/auth/register",
        json={"email": "commit-failure@example.com", "password": "Password123!"},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


def test_me_database_failure_returns_service_unavailable(
    client, db_session, test_email
):
    token_response = client.post(
        "/v1/auth/register",
        json={"email": test_email, "password": "Password123!"},
    )
    assert token_response.status_code == 201
    token = token_response.json()["access_token"]

    override_db_with(BrokenQuerySession())

    response = client.get("/v1/auth/me", headers=auth_headers(token))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"
