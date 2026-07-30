from __future__ import annotations

from app.models_db import BusinessMembership
from app.routers import business as business_router
from app.supabase_admin import SupabaseAdminError
from conftest import create_db_profile, make_business_account, override_current_user


def test_business_summary_requires_business_or_membership(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.get("/v1/me/business/summary")

    assert response.status_code == 404


def test_business_summary_returns_owner_data(client, db_session):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    override_current_user(owner)

    response = client.get("/v1/me/business/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["financial_health_score"] is None
    assert body["leaks_found"] == 0


def _link_member(db_session, owner_profile, member_profile) -> BusinessMembership:
    membership = BusinessMembership(
        owner_user_id=owner_profile.id,
        member_user_id=member_profile.id,
        invited_email=f"{member_profile.id}@pytest.invalid",
    )
    db_session.add(membership)
    db_session.commit()
    return membership


def test_member_sees_owners_analysis(client, db_session):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    member = create_db_profile(db_session, role="user")
    _link_member(db_session, owner, member)

    override_current_user(owner)
    analyze_response = client.post(
        "/v1/me/business/analyze",
        json={
            "transactions": [
                {
                    "id": "t1",
                    "timestamp": "2026-06-15T12:00:00Z",
                    "amount": -99.5,
                    "description": "Vendor fee",
                    "direction": "debit",
                }
            ]
        },
    )
    assert analyze_response.status_code == 201

    override_current_user(member)
    summary_response = client.get("/v1/me/business/summary")
    assert summary_response.status_code == 200
    assert summary_response.json()["financial_health_score"] is not None

    analyses_response = client.get("/v1/me/business/analyses")
    assert analyses_response.status_code == 200
    assert len(analyses_response.json()) == 1


def test_member_linked_account_attributed_to_owner(client, db_session):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    member = create_db_profile(db_session, role="user")
    _link_member(db_session, owner, member)

    override_current_user(member)
    link_response = client.post(
        "/v1/me/business/accounts/link",
        json={"bank_name": "Pytest Bank", "branch_label": "HQ"},
    )
    assert link_response.status_code == 201
    assert link_response.json()["branch_label"] == "HQ"

    # Visible to the owner too -- it's the business's account, not the member's own.
    override_current_user(owner)
    owner_accounts = client.get("/v1/me/business/accounts").json()
    assert len(owner_accounts) == 1
    assert owner_accounts[0]["bank_name"] == "Pytest Bank"

    # Not visible under the member's own individual account list.
    override_current_user(member)
    member_own_accounts = client.get("/v1/accounts").json()
    assert member_own_accounts == []


def test_freeze_and_unfreeze_are_business_scoped(client, db_session):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    member = create_db_profile(db_session, role="user")
    _link_member(db_session, owner, member)

    override_current_user(member)
    freeze_response = client.post(
        "/v1/me/business/freeze", json={"leak_id": "leak-1", "reason": "test freeze"}
    )
    assert freeze_response.status_code == 201
    frozen_item_id = freeze_response.json()["frozen_item_id"]

    override_current_user(owner)
    frozen_list = client.get("/v1/me/business/frozen").json()
    assert any(item["id"] == frozen_item_id for item in frozen_list)

    unfreeze_response = client.post(f"/v1/me/business/unfreeze/{frozen_item_id}")
    assert unfreeze_response.status_code == 200

    frozen_list_after = client.get("/v1/me/business/frozen").json()
    assert all(item["id"] != frozen_item_id for item in frozen_list_after)


def test_invite_member_requires_business_owner(client, db_session):
    profile = create_db_profile(db_session, role="user")
    override_current_user(profile)

    response = client.post("/v1/me/business/invite-member", json={"email": "staff@example.com"})

    assert response.status_code == 403


def test_invite_member_rejects_non_owner_member(client, db_session):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    member = create_db_profile(db_session, role="user")
    _link_member(db_session, owner, member)

    override_current_user(member)
    response = client.post("/v1/me/business/invite-member", json={"email": "another@example.com"})

    assert response.status_code == 403


def test_invite_member_creates_membership(client, db_session, monkeypatch):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    invited = create_db_profile(db_session, role="user")

    async def fake_invite(email, role):
        return {"id": str(invited.id), "email": email}

    monkeypatch.setattr(business_router, "invite_user_by_email", fake_invite)
    override_current_user(owner)

    response = client.post(
        "/v1/me/business/invite-member", json={"email": "new-staff@example.com"}
    )

    assert response.status_code == 201
    assert response.json()["member_user_id"] == str(invited.id)

    members = client.get("/v1/me/business/members").json()
    assert any(m["member_user_id"] == str(invited.id) for m in members)


def test_invite_member_rejects_already_a_member(client, db_session, monkeypatch):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    other_owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, other_owner, business_name="Other Business")
    already_member = create_db_profile(db_session, role="user")
    _link_member(db_session, other_owner, already_member)

    async def fake_invite(email, role):
        return {"id": str(already_member.id), "email": email}

    monkeypatch.setattr(business_router, "invite_user_by_email", fake_invite)
    override_current_user(owner)

    response = client.post(
        "/v1/me/business/invite-member", json={"email": "already-taken@example.com"}
    )

    assert response.status_code == 409


def test_invite_member_maps_supabase_error(client, db_session, monkeypatch):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)

    async def fake_invite(email, role):
        raise SupabaseAdminError("boom", status_code=503)

    monkeypatch.setattr(business_router, "invite_user_by_email", fake_invite)
    override_current_user(owner)

    response = client.post("/v1/me/business/invite-member", json={"email": "x@example.com"})

    assert response.status_code == 503


def test_remove_member_revokes_access(client, db_session):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    member = create_db_profile(db_session, role="user")
    membership = _link_member(db_session, owner, member)

    override_current_user(owner)
    response = client.delete(f"/v1/me/business/members/{membership.id}")
    assert response.status_code == 200

    override_current_user(member)
    summary_response = client.get("/v1/me/business/summary")
    assert summary_response.status_code == 404


def test_me_account_reflects_business_membership(client, db_session):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    member = create_db_profile(db_session, role="user")
    _link_member(db_session, owner, member)

    override_current_user(member)
    response = client.get("/v1/me/account")

    assert response.status_code == 200
    body = response.json()
    assert body["account_type"] == "individual"
    assert body["is_business_member"] is True


def test_remove_member_requires_owner(client, db_session):
    owner = create_db_profile(db_session, role="user")
    make_business_account(db_session, owner)
    member = create_db_profile(db_session, role="user")
    membership = _link_member(db_session, owner, member)

    override_current_user(member)
    response = client.delete(f"/v1/me/business/members/{membership.id}")

    assert response.status_code == 403
