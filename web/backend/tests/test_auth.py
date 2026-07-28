from __future__ import annotations

from app.settings import settings

from conftest import (
    BrokenQuerySession,
    auth_headers,
    create_db_profile,
    override_current_user,
    override_db_with,
    supabase_style_token,
)


def test_me_returns_current_user_profile(client, db_session):
    profile = create_db_profile(db_session, role="admin", full_name="Test User")
    override_current_user(profile, email="me@example.com")

    response = client.get("/v1/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(profile.id)
    assert body["email"] == "me@example.com"
    assert body["role"] == "admin"


def test_me_requires_authorization(client):
    # FastAPI's HTTPBearer security scheme itself returns 403 (not 401) when
    # no Authorization header is present at all; 401 is reserved for a
    # present-but-invalid token (see get_current_user).
    response = client.get("/v1/auth/me")
    assert response.status_code == 403


def test_me_defaults_role_to_user_when_no_profile_row_exists(client, db_session):
    # A JWT can be valid (a real Supabase user) before a `profiles` row exists
    # for them -- get_current_user should default to "user", not 500.
    import uuid

    user_id = uuid.uuid4()
    token = supabase_style_token(user_id, "brand-new@example.com")

    response = client.get("/v1/auth/me", headers=auth_headers(token))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user_id)
    assert body["role"] == "user"


def test_me_database_failure_returns_service_unavailable(client):
    import uuid

    token = supabase_style_token(uuid.uuid4(), "db-failure@example.com")
    override_db_with(BrokenQuerySession())

    response = client.get("/v1/auth/me", headers=auth_headers(token))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


def test_bootstrap_admin_rejects_wrong_token(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_token", "correct-token")

    response = client.post(
        "/v1/auth/bootstrap-admin",
        json={"email": "someone@example.com", "bootstrap_token": "wrong-token"},
    )

    assert response.status_code == 403


def test_bootstrap_admin_requires_configuration(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_token", "")

    response = client.post(
        "/v1/auth/bootstrap-admin",
        json={"email": "someone@example.com", "bootstrap_token": "anything"},
    )

    assert response.status_code == 403


def test_bootstrap_admin_404s_for_unknown_supabase_account(client, monkeypatch, test_email):
    monkeypatch.setattr(settings, "admin_bootstrap_token", "correct-token")

    response = client.post(
        "/v1/auth/bootstrap-admin",
        json={"email": test_email, "bootstrap_token": "correct-token"},
    )

    assert response.status_code == 404


# Note: the "successfully promotes an existing Supabase user to admin" happy
# path is intentionally not covered here -- it requires a real row in
# Supabase's `auth.users` (a schema this test suite doesn't own or create),
# and faking one directly would risk bypassing Supabase's own invariants for
# very little value. Covered manually per the verification plan instead.
