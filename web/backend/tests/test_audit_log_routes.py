from __future__ import annotations

from conftest import create_db_profile, override_current_user


def test_audit_log_requires_admin(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.get("/v1/admin/audit-log")

    assert response.status_code == 403


def test_audit_log_lists_recent_admin_actions(client, db_session):
    admin = create_db_profile(db_session, role="admin")
    override_current_user(admin)

    response = client.get("/v1/admin/audit-log")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    # The router-level admin audit dependency logs this very call.
    assert any(
        entry["event_type"] == "admin_action" and entry["actor_user_id"] == str(admin.id)
        for entry in body
    )


def test_audit_log_filters_by_event_type(client, db_session):
    admin = create_db_profile(db_session, role="admin")
    override_current_user(admin)

    client.get("/v1/admin/stats/overview")

    response = client.get("/v1/admin/audit-log", params={"event_type": "admin_action"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 1
    assert all(entry["event_type"] == "admin_action" for entry in body)


def test_audit_log_respects_limit(client, db_session):
    admin = create_db_profile(db_session, role="admin")
    override_current_user(admin)

    response = client.get("/v1/admin/audit-log", params={"limit": 1})

    assert response.status_code == 200
    assert len(response.json()) <= 1
