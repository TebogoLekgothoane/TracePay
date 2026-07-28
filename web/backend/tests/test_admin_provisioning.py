from __future__ import annotations

from app.models_db import AuditLog, Profile
from app.routers import admin as admin_router
from app.supabase_admin import SupabaseAdminError
from conftest import create_db_profile, override_current_user


def test_provision_user_requires_admin_role(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.post(
        "/v1/admin/provision-user", json={"email": "new-partner@example.com", "role": "partner"}
    )

    assert response.status_code == 403


def test_provision_user_sets_role_and_audits(client, db_session, monkeypatch):
    admin = create_db_profile(db_session, role="admin")
    # Stands in for the auth.users row Supabase's real invite API would have
    # created -- profiles.id has a real FK to auth.users.id, so the fake
    # invite response must point at a row that actually exists.
    invited = create_db_profile(db_session, role="user")

    async def fake_invite(email, role):
        return {"id": str(invited.id), "email": email}

    monkeypatch.setattr(admin_router, "invite_user_by_email", fake_invite)
    override_current_user(admin)

    response = client.post(
        "/v1/admin/provision-user",
        json={"email": "new-partner@example.com", "role": "partner"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == str(invited.id)
    assert body["role"] == "partner"

    db_session.expire_all()
    refreshed = db_session.query(Profile).filter(Profile.id == invited.id).one()
    assert refreshed.role == "partner"

    assert (
        db_session.query(AuditLog)
        .filter(
            AuditLog.event_type == "user_provisioned",
            AuditLog.target_user_id == invited.id,
        )
        .count()
        == 1
    )


def test_provision_user_maps_supabase_error_status(client, db_session, monkeypatch):
    admin = create_db_profile(db_session, role="admin")

    async def fake_invite(email, role):
        raise SupabaseAdminError("User already registered", status_code=409)

    monkeypatch.setattr(admin_router, "invite_user_by_email", fake_invite)
    override_current_user(admin)

    response = client.post(
        "/v1/admin/provision-user",
        json={"email": "dup@example.com", "role": "user"},
    )

    assert response.status_code == 409


def test_provision_user_not_configured_maps_to_503(client, db_session, monkeypatch):
    admin = create_db_profile(db_session, role="admin")

    async def fake_invite(email, role):
        raise SupabaseAdminError("not configured", status_code=503)

    monkeypatch.setattr(admin_router, "invite_user_by_email", fake_invite)
    override_current_user(admin)

    response = client.post(
        "/v1/admin/provision-user",
        json={"email": "x@example.com", "role": "investor"},
    )

    assert response.status_code == 503


def test_provision_user_rejects_invalid_role(client, db_session):
    admin = create_db_profile(db_session, role="admin")
    override_current_user(admin)

    response = client.post(
        "/v1/admin/provision-user",
        json={"email": "x@example.com", "role": "superadmin"},
    )

    assert response.status_code == 422
