from __future__ import annotations

from app.main import app
from app.models_db import AuditLog
from conftest import auth_headers, create_db_user


def _login_token(client, email: str) -> str:
    login_response = client.post(
        "/v1/auth/login", json={"email": email, "password": "Password123!"}
    )
    assert login_response.status_code == 200
    return login_response.json()["access_token"]


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


def test_admin_overview_stats_requires_admin(client, db_session, test_email):
    create_db_user(db_session, test_email, role="admin")
    token = _login_token(client, test_email)

    response = client.get("/v1/admin/stats/overview", headers=auth_headers(token))

    assert response.status_code == 200
    body = response.json()
    assert "total_users" in body
    assert "total_linked_accounts" in body
    assert "total_frozen_items" in body
    assert (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "admin_action", AuditLog.event_metadata["path"].as_string() == "/v1/admin/stats/overview")
        .count()
        >= 1
    )


def test_admin_users_requires_admin(client, db_session, test_email):
    create_db_user(db_session, test_email, role="user")
    token = _login_token(client, test_email)

    response = client.get(
        "/v1/admin/users", headers=auth_headers(token)
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_admin_users_allows_admin(client, db_session, test_email):
    create_db_user(db_session, test_email, role="admin")
    token = _login_token(client, test_email)

    response = client.get(
        "/v1/admin/users", headers=auth_headers(token)
    )

    assert response.status_code == 200
    body = response.json()
    assert "users" in body
    assert "total" in body
