from __future__ import annotations

from app.models_db import Redemption
from conftest import create_db_profile, create_test_partner, override_current_user


def test_list_partners_requires_authorization(client):
    assert client.get("/v1/partners").status_code == 403


def test_list_partners_only_shows_active_offers(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)
    active = create_test_partner(db_session, points_cost=100)
    inactive = create_test_partner(db_session, points_cost=200, is_active=False)

    response = client.get("/v1/partners")

    assert response.status_code == 200
    ids = {p["id"] for p in response.json()}
    assert active.id in ids
    assert inactive.id not in ids


def test_redeem_rejects_unknown_partner(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.post("/v1/me/redeem", json={"partner_id": "does-not-exist"})

    assert response.status_code == 404


def test_redeem_rejects_insufficient_points(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)
    partner = create_test_partner(db_session, points_cost=500)

    response = client.post("/v1/me/redeem", json={"partner_id": partner.id})

    assert response.status_code == 400


def test_redeem_deducts_points_and_records_commission(client, db_session):
    profile = create_db_profile(db_session, role="user")
    profile.reward_points = 150
    db_session.commit()
    override_current_user(profile)
    partner = create_test_partner(
        db_session, points_cost=100, estimated_value_rand=200.0, commission_rate=0.025
    )

    response = client.post("/v1/me/redeem", json={"partner_id": partner.id})

    assert response.status_code == 201
    body = response.json()
    assert body["partner_id"] == partner.id
    assert body["points_spent"] == 100
    assert body["remaining_points"] == 50

    redemption = db_session.query(Redemption).filter(Redemption.id == body["redemption_id"]).one()
    assert redemption.user_id == profile.id
    assert redemption.commission_amount == 5.0  # 200.0 * 0.025


def test_redeem_rejects_inactive_partner(client, db_session):
    profile = create_db_profile(db_session, role="user")
    profile.reward_points = 500
    db_session.commit()
    override_current_user(profile)
    partner = create_test_partner(db_session, points_cost=100, is_active=False)

    response = client.post("/v1/me/redeem", json={"partner_id": partner.id})

    assert response.status_code == 404


def test_partner_summary_rejects_plain_user(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.get("/v1/partner/summary")

    assert response.status_code == 403


def test_partner_summary_404s_when_no_partner_row_linked(client, db_session):
    profile = create_db_profile(db_session, role="partner")
    override_current_user(profile)

    response = client.get("/v1/partner/summary")

    assert response.status_code == 404


def test_partner_summary_reflects_own_redemptions_only(client, db_session):
    partner_user = create_db_profile(db_session, role="partner")
    shopper = create_db_profile(db_session, role="user")
    shopper.reward_points = 200
    db_session.commit()

    partner = create_test_partner(
        db_session,
        owner=partner_user,
        points_cost=100,
        estimated_value_rand=100.0,
        commission_rate=0.025,
    )
    other_partner = create_test_partner(db_session, points_cost=50, estimated_value_rand=50.0)

    override_current_user(shopper)
    assert client.post("/v1/me/redeem", json={"partner_id": partner.id}).status_code == 201

    override_current_user(shopper)
    # Second redemption targeting a partner this partner-user does NOT own --
    # must not bleed into the first partner's summary.
    shopper.reward_points = 100
    db_session.commit()
    assert client.post("/v1/me/redeem", json={"partner_id": other_partner.id}).status_code == 201

    override_current_user(partner_user)
    response = client.get("/v1/partner/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["partner_id"] == partner.id
    assert body["total_redemptions"] == 1
    assert body["total_points_redeemed"] == 100
    assert body["total_commission_owed"] == 2.5


def test_partner_redemptions_list_scoped_to_own_partner(client, db_session):
    partner_user = create_db_profile(db_session, role="partner")
    shopper = create_db_profile(db_session, role="user")
    shopper.reward_points = 100
    db_session.commit()

    partner = create_test_partner(db_session, owner=partner_user, points_cost=100)

    override_current_user(shopper)
    assert client.post("/v1/me/redeem", json={"partner_id": partner.id}).status_code == 201

    override_current_user(partner_user)
    response = client.get("/v1/partner/redemptions")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["points_spent"] == 100
    # No user identity leaked to the partner -- only transaction facts.
    assert "user_id" not in body[0]


def test_admin_can_see_any_partner_regardless_of_ownership(client, db_session):
    other_owner = create_db_profile(db_session, role="partner")
    admin = create_db_profile(db_session, role="admin")
    create_test_partner(db_session, owner=other_owner, points_cost=100)

    override_current_user(admin)
    response = client.get("/v1/admin/partners")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_admin_can_create_and_update_partner(client, db_session):
    admin = create_db_profile(db_session, role="admin")
    override_current_user(admin)

    create_response = client.post(
        "/v1/admin/partners",
        json={
            "id": "test-admin-created-partner",
            "name": "New Partner",
            "offer_description": "10% off",
            "points_cost": 75,
            "estimated_value_rand": 60.0,
        },
    )
    db_session.info["created_partner_ids"].append("test-admin-created-partner")
    assert create_response.status_code == 201
    assert create_response.json()["is_active"] is True

    update_response = client.put(
        "/v1/admin/partners/test-admin-created-partner",
        json={"is_active": False},
    )
    assert update_response.status_code == 200
    assert update_response.json()["is_active"] is False


def test_admin_create_partner_rejects_duplicate_id(client, db_session):
    admin = create_db_profile(db_session, role="admin")
    override_current_user(admin)
    existing = create_test_partner(db_session)

    response = client.post(
        "/v1/admin/partners",
        json={
            "id": existing.id,
            "name": "Dup",
            "offer_description": "dup",
            "points_cost": 10,
            "estimated_value_rand": 10.0,
        },
    )

    assert response.status_code == 409
