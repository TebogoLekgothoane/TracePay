from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from .auth import AuthenticatedUser, get_current_user
from .database import get_db
from .models_db import AccountSettings, BusinessMembership


def resolve_business_user_id(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """Resolve whose business data the caller should see: their own, if
    they're the business account owner, or their employer's, if they're an
    invited member. This is the one deliberate exception to "you only ever
    see your own data" elsewhere in this app -- gated entirely by an
    explicit `business_memberships` row, never inferred.
    """
    settings_row = db.query(AccountSettings).filter(AccountSettings.user_id == current_user.id).first()
    if settings_row is not None and settings_row.account_type == "business":
        return current_user.id

    membership = (
        db.query(BusinessMembership)
        .filter(BusinessMembership.member_user_id == current_user.id)
        .first()
    )
    if membership is not None:
        return membership.owner_user_id

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="This account isn't linked to a business yet.",
    )


def require_business_owner(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    """Like resolve_business_user_id, but for team management specifically --
    only the business account owner may invite or remove members, never an
    existing member."""
    settings_row = db.query(AccountSettings).filter(AccountSettings.user_id == current_user.id).first()
    if settings_row is None or settings_row.account_type != "business":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a business account owner can manage team members.",
        )
    return current_user
