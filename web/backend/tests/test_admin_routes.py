from __future__ import annotations

from app.main import app
from app.models_db import AuditLog
from conftest import create_db_profile, override_current_user


def _sample_admin_path(path: str) -> str:
    return path.replace("{user_id}", "00000000-0000-0000-0000-000000000001")


def test_every_admin_route_requires_authorization(client):
    admin_routes = [
        route
        for route in app.routes
        if getattr(route, "path", "").startswith("/v1/admin")
        and getattr(route, "methods", None)
    ]
    assert admin_routes

    for route in admin_routes:
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            response = client.request(method, _sample_admin_path(route.path))
            assert response.status_code in {401, 403}, f"{method} {route.path}"


def test_admin_overview_stats_requires_admin(client, db_session):
    profile = create_db_profile(db_session, role="admin")
    override_current_user(profile)

    response = client.get("/v1/admin/stats/overview")

    assert response.status_code == 200
    body = response.json()
    assert "total_users" in body
    assert "total_linked_accounts" in body
    assert "total_frozen_items" in body
    assert (
        db_session.query(AuditLog)
        .filter(
            AuditLog.event_type == "admin_action",
            AuditLog.event_metadata["path"].as_string() == "/v1/admin/stats/overview",
        )
        .count()
        >= 1
    )


def test_admin_operational_stats_exposes_decision_metrics(client, db_session):
    admin = create_db_profile(db_session, role="admin")
    create_db_profile(db_session, role="user", full_name="Active Customer")
    override_current_user(admin)

    response = client.get("/v1/admin/stats/operations", params={"days": 30})

    assert response.status_code == 200
    body = response.json()
    assert body["period_days"] == 30
    assert body["funnel"]["registered_users"] >= 1
    assert body["funnel"]["completed_profiles"] >= 1
    assert len(body["daily_activity"]) == 30
    assert {"current", "previous"} <= body["active_users"].keys()
    assert isinstance(body["alerts"], list)
    assert {"individual_accounts", "business_accounts", "freeze_rate"} <= body.keys()


def test_admin_users_requires_admin(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.get("/v1/admin/users")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_admin_users_allows_admin(client, db_session):
    profile = create_db_profile(db_session, role="admin")
    override_current_user(profile)

    response = client.get("/v1/admin/users")

    assert response.status_code == 200
    body = response.json()
    assert "users" in body
    assert "total" in body
