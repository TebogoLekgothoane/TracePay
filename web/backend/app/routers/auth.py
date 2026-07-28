from __future__ import annotations

from secrets import compare_digest

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from ..auth import ROLE_ADMIN, AuthenticatedUser, get_current_user
from ..database import get_db
from ..models_db import Profile
from ..settings import settings

router = APIRouter(prefix="/auth", tags=["authentication"])

# Identity, login, registration, password reset, and email verification are
# all handled by Supabase Auth directly (the dashboard and mobile app both
# call the Supabase client SDK, not this backend). This router only exposes
# what genuinely needs to live server-side: reading the caller's own profile,
# and promoting an existing Supabase user to admin.


class BootstrapAdminRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    bootstrap_token: str = Field(min_length=1, max_length=512)


class UserResponse(BaseModel):
    id: str  # UUID as string
    email: str
    role: str


class MessageResponse(BaseModel):
    message: str


@router.get("/me", response_model=UserResponse)
def get_me(current_user: AuthenticatedUser = Depends(get_current_user)) -> UserResponse:
    """Get current user information"""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        role=current_user.role,
    )


@router.post("/bootstrap-admin", response_model=MessageResponse)
def bootstrap_admin(req: BootstrapAdminRequest, db: Session = Depends(get_db)) -> MessageResponse:
    """Promote an existing Supabase Auth user to admin using a shared bootstrap token.

    Does not create a user -- the person must have already signed up via
    Supabase Auth (mobile app or dashboard) before they can be promoted.
    """
    if not settings.admin_bootstrap_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin bootstrap is not configured.",
        )
    if not compare_digest(req.bootstrap_token, settings.admin_bootstrap_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap token")

    email = req.email.strip().lower()
    try:
        existing_admin = db.query(Profile).filter(Profile.role == ROLE_ADMIN).first()
        if existing_admin:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Admin bootstrap has already been completed",
            )

        row = db.execute(
            text("SELECT id FROM auth.users WHERE lower(email) = :email"),
            {"email": email},
        ).first()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No Supabase account found for that email. Sign up first, then bootstrap.",
            )
        user_id = row[0]

        profile = db.query(Profile).filter(Profile.id == user_id).first()
        if profile is None:
            db.execute(
                text("INSERT INTO profiles (id, role) VALUES (:id, :role)"),
                {"id": user_id, "role": ROLE_ADMIN},
            )
        else:
            profile.role = ROLE_ADMIN
        db.commit()
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while bootstrapping the admin account.",
        ) from exc

    return MessageResponse(message=f"{email} is now an admin.")
