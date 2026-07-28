from __future__ import annotations

from conftest import create_db_profile, override_current_user


def test_investor_overview_rejects_plain_user(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.get("/v1/investor/overview")

    assert response.status_code == 403


def test_investor_overview_allows_investor_role(client, db_session):
    profile = create_db_profile(db_session, role="investor")
    override_current_user(profile)

    response = client.get("/v1/investor/overview")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {
        "total_users",
        "active_users",
        "total_analyses",
        "average_health_score",
        "total_capital_protected",
        "total_frozen_items",
    }
    # Never leaks anything that could identify an individual user.
    assert "email" not in body
    assert "username" not in body
    assert "users" not in body


def test_investor_overview_allows_admin_role_too(client, db_session):
    profile = create_db_profile(db_session, role="admin")
    override_current_user(profile)

    response = client.get("/v1/investor/overview")

    assert response.status_code == 200


def test_investor_regional_rejects_plain_user(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.get("/v1/investor/regional")

    assert response.status_code == 403


def test_investor_regional_allows_investor_role(client, db_session):
    profile = create_db_profile(db_session, role="investor")
    override_current_user(profile)

    response = client.get("/v1/investor/regional")

    assert response.status_code == 200
    assert isinstance(response.json(), list)
