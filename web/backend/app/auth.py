from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .database import get_db
from .models_db import Profile
from .settings import settings

# Supabase Auth issues HS256-signed JWTs using the project's shared JWT secret
# (Project Settings -> API -> JWT Settings). This backend only ever verifies
# tokens Supabase itself issued -- it never issues its own.
ALGORITHM = "HS256"
AUDIENCE = "authenticated"

security = HTTPBearer()

# `profiles.role` values. Every account is one of these -- there is no
# separate "business" role: a business account is a ROLE_USER whose own
# linked transactions get analyzed like anyone else's, just billed
# differently (see the account_type/billing work tracked separately).
ROLE_USER = "user"
ROLE_ADMIN = "admin"
ROLE_INVESTOR = "investor"
ROLE_PARTNER = "partner"


@dataclass(frozen=True)
class AuthenticatedUser:
    """Lightweight identity derived from a verified Supabase JWT + profiles row.

    Not an ORM model -- deliberately kept separate from `Profile` so call sites
    can't accidentally treat a request's identity as a mutable DB row.
    """

    id: uuid.UUID
    email: str
    role: str


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    """Verify a Supabase-issued access token and resolve the caller's app role.

    Note: the JWT's own `role` claim is a Postgres role hint (normally
    "authenticated"), NOT this app's admin/investor/user role -- that
    always comes from the `profiles` table, never from the token.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=[ALGORITHM],
            audience=AUDIENCE,
        )
        user_id_str = payload.get("sub")
        email = payload.get("email")
        if not user_id_str or not email:
            raise credentials_exception
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception

    try:
        profile = db.query(Profile).filter(Profile.id == user_id).first()
    except OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while verifying the current user.",
        ) from exc

    role = profile.role if profile is not None else ROLE_USER
    return AuthenticatedUser(id=user_id, email=email, role=role)


def get_current_admin_user(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    """Get current user and verify they are a TracePay admin.

    Investors are a separate, much narrower role (see ROLE_INVESTOR) and
    must NOT satisfy this check -- they get their own curated view, not
    admin access. Previously "stakeholder" (now "investor") was treated as
    admin-equivalent here; that was a bug, not a design choice.
    """
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    return current_user


def get_current_investor_user(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    """Get current user and verify they can see the investor view.

    Admins can see it too (a superset, for support/QA), but a plain user
    cannot.
    """
    if current_user.role not in (ROLE_ADMIN, ROLE_INVESTOR):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    return current_user


def get_current_partner_user(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    """Get current user and verify they can see a partner view.

    Only proves the *role* -- the caller must still be resolved to a
    specific `Partner` row (via `Partner.owner_user_id`) before any
    partner-scoped data is returned.
    """
    if current_user.role not in (ROLE_ADMIN, ROLE_PARTNER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    return current_user
