# In web/backend/app/routers/auth.py - Remove duplicates and fix:

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from secrets import compare_digest
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from jose import JWTError
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from ..audit import add_audit_event
from ..auth import decode_token, create_access_token, get_current_user, get_password_hash, normalize_email, verify_password
from ..database import get_db
from ..email_service import (
    ensure_email_delivery_configured,
    send_email_verification_email,
    send_password_reset_email,
)
from ..models_db import User
from ..settings import settings

router = APIRouter(prefix="/auth", tags=["authentication"])

PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 30
EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES = 60 * 24
PASSWORD_RESET_PURPOSE = "password_reset"
EMAIL_VERIFICATION_PURPOSE = "email_verification"
LOGIN_RATE_LIMIT_ATTEMPTS = 5
LOGIN_RATE_LIMIT_WINDOW = timedelta(minutes=15)
REGISTER_RATE_LIMIT_ATTEMPTS = 3
REGISTER_RATE_LIMIT_WINDOW = timedelta(hours=1)
PASSWORD_RESET_RATE_LIMIT_ATTEMPTS = 3
PASSWORD_RESET_RATE_LIMIT_WINDOW = timedelta(hours=1)
EMAIL_VERIFICATION_RATE_LIMIT_ATTEMPTS = 3
EMAIL_VERIFICATION_RATE_LIMIT_WINDOW = timedelta(hours=1)
TOKEN_CONFIRM_RATE_LIMIT_ATTEMPTS = 8
TOKEN_CONFIRM_RATE_LIMIT_WINDOW = timedelta(minutes=15)
FAILED_LOGIN_LOCKOUT_ATTEMPTS = 5
FAILED_LOGIN_LOCKOUT_WINDOW = timedelta(minutes=15)
_AUTH_RATE_LIMITS: dict[tuple[str, str], list[datetime]] = {}


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class BootstrapAdminRequest(RegisterRequest):
    bootstrap_token: str = Field(min_length=1, max_length=512)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class ConfirmPasswordResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str  # UUID as string
    email: str
    role: str


class UserResponse(BaseModel):
    id: str  # UUID as string
    email: str
    role: str
    created_at: str
    email_verified: bool


class AuthActionResponse(BaseModel):
    message: str


class MessageResponse(BaseModel):
    message: str


def _auth_action_response() -> AuthActionResponse:
    return AuthActionResponse(
        message="If an account exists for that email, follow-up instructions have been issued.",
    )


def _create_user_action_token(user: User, purpose: str, expires_minutes: int) -> str:
    return create_access_token(
        data={
            "sub": str(user.id),
            "purpose": purpose,
            "ver": user.auth_token_version or 0,
        },
        expires_delta=timedelta(minutes=expires_minutes),
    )


def _decode_user_action_token(token: str, purpose: str) -> tuple[uuid.UUID, int]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired token",
    )
    try:
        payload = decode_token(token)
        if payload.get("purpose") != purpose:
            raise credentials_exception
        user_id = uuid.UUID(str(payload.get("sub")))
        token_version = int(payload.get("ver"))
    except (JWTError, TypeError, ValueError):
        raise credentials_exception
    return user_id, token_version


def _action_link(path: str, token: str) -> str:
    base_url = settings.app_public_url.rstrip("/")
    return f"{base_url}{path}?token={quote(token)}"


def _client_rate_limit_id(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _check_auth_rate_limit(action: str, subject: str, limit: int, window: timedelta) -> None:
    now = datetime.utcnow()
    cutoff = now - window
    key = (action, subject)
    attempts = [attempt for attempt in _AUTH_RATE_LIMITS.get(key, []) if attempt > cutoff]

    if len(attempts) >= limit:
        retry_at = attempts[0] + window
        retry_after = max(1, int((retry_at - now).total_seconds()))
        _AUTH_RATE_LIMITS[key] = attempts
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    attempts.append(now)
    _AUTH_RATE_LIMITS[key] = attempts


def _seconds_until(until: datetime) -> int:
    now = datetime.now(until.tzinfo) if until.tzinfo else datetime.utcnow()
    return max(1, int((until - now).total_seconds()))


def _is_future(until: datetime) -> bool:
    now = datetime.now(until.tzinfo) if until.tzinfo else datetime.utcnow()
    return until > now


def _raise_login_cooldown(until: datetime) -> None:
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many failed login attempts. Please try again later.",
        headers={"Retry-After": str(_seconds_until(until))},
    )


def _record_failed_login(user: User, db: Session) -> None:
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= FAILED_LOGIN_LOCKOUT_ATTEMPTS:
        user.login_cooldown_until = datetime.utcnow() + FAILED_LOGIN_LOCKOUT_WINDOW
    try:
        db.commit()
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while updating login attempts.",
        ) from exc


def _clear_failed_login_state(user: User, db: Session) -> None:
    if not user.failed_login_attempts and user.login_cooldown_until is None:
        return
    user.failed_login_attempts = 0
    user.login_cooldown_until = None
    try:
        db.commit()
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while updating login state.",
        ) from exc


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    """Register a new user"""
    email = normalize_email(req.email)
    client_id = _client_rate_limit_id(request)
    _check_auth_rate_limit("register", client_id, REGISTER_RATE_LIMIT_ATTEMPTS, REGISTER_RATE_LIMIT_WINDOW)
    _check_auth_rate_limit("register-email", email, REGISTER_RATE_LIMIT_ATTEMPTS, REGISTER_RATE_LIMIT_WINDOW)
    try:
        existing_user = db.query(User).filter(User.email == email).first()
    except OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while creating an account. Check DATABASE_URL and Supabase credentials.",
        ) from exc

    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    hashed_password = get_password_hash(req.password)
    user = User(email=email, password_hash=hashed_password, role="user")
    db.add(user)
    try:
        db.flush()
        add_audit_event(
            db,
            "user_created",
            actor=user,
            target_user=user,
            metadata={"role": user.role, "source": "self_register"},
            request=request,
        )
        db.commit()
        db.refresh(user)
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while saving the new user. Check DATABASE_URL and Supabase credentials.",
        ) from exc

    access_token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        user_id=str(user.id),  # Convert UUID to string
        email=user.email,
        role=user.role
    )


@router.post("/bootstrap-admin", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def bootstrap_admin(req: BootstrapAdminRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    """Create the initial admin account using an explicit bootstrap token."""
    if not settings.admin_bootstrap_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin bootstrap is not configured.",
        )
    if not compare_digest(req.bootstrap_token, settings.admin_bootstrap_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap token")

    email = normalize_email(req.email)
    try:
        existing_admin = db.query(User).filter(User.role == "admin").first()
        existing_user = db.query(User).filter(User.email == email).first()
    except OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while creating an admin account. Check DATABASE_URL and Supabase credentials.",
        ) from exc

    if existing_admin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin bootstrap has already been completed")
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    hashed_password = get_password_hash(req.password)
    user = User(email=email, password_hash=hashed_password, role="admin")
    db.add(user)
    try:
        db.flush()
        add_audit_event(
            db,
            "user_created",
            actor=user,
            target_user=user,
            metadata={"role": user.role, "source": "bootstrap_admin"},
            request=request,
        )
        db.commit()
        db.refresh(user)
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while saving the new admin. Check DATABASE_URL and Supabase credentials.",
        ) from exc

    access_token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        user_id=str(user.id),  # Convert UUID to string
        email=user.email,
        role=user.role
    )


@router.post("/password-reset/request", response_model=AuthActionResponse, status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(
    req: EmailActionRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthActionResponse:
    """Send password reset instructions when the account exists."""
    ensure_email_delivery_configured()
    email = normalize_email(req.email)
    client_id = _client_rate_limit_id(request)
    _check_auth_rate_limit(
        "password-reset",
        client_id,
        PASSWORD_RESET_RATE_LIMIT_ATTEMPTS,
        PASSWORD_RESET_RATE_LIMIT_WINDOW,
    )
    _check_auth_rate_limit(
        "password-reset-email",
        email,
        PASSWORD_RESET_RATE_LIMIT_ATTEMPTS,
        PASSWORD_RESET_RATE_LIMIT_WINDOW,
    )
    try:
        user = db.query(User).filter(User.email == email).first()
    except OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while requesting a password reset.",
        ) from exc

    if not user or not user.is_active:
        return _auth_action_response()

    token = _create_user_action_token(user, PASSWORD_RESET_PURPOSE, PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    reset_url = _action_link("/reset-password", token)
    send_password_reset_email(user.email, reset_url)
    add_audit_event(
        db,
        "password_reset_requested",
        actor=user,
        target_user=user,
        metadata={"email": user.email},
        request=request,
    )
    db.commit()
    return _auth_action_response()


@router.post("/password-reset/confirm", response_model=MessageResponse)
def confirm_password_reset(
    req: ConfirmPasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Reset a user's password using a password reset token."""
    _check_auth_rate_limit(
        "password-reset-confirm",
        _client_rate_limit_id(request),
        TOKEN_CONFIRM_RATE_LIMIT_ATTEMPTS,
        TOKEN_CONFIRM_RATE_LIMIT_WINDOW,
    )
    user_id, token_version = _decode_user_action_token(req.token, PASSWORD_RESET_PURPOSE)
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while resetting the password.",
        ) from exc

    if not user or not user.is_active or (user.auth_token_version or 0) != token_version:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user.password_hash = get_password_hash(req.new_password)
    user.auth_token_version = (user.auth_token_version or 0) + 1
    try:
        add_audit_event(
            db,
            "password_reset_completed",
            actor=user,
            target_user=user,
            metadata={"email": user.email},
            request=request,
        )
        db.commit()
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while saving the new password.",
        ) from exc

    return MessageResponse(message="Password has been reset.")


@router.post("/email-verification/request", response_model=AuthActionResponse, status_code=status.HTTP_202_ACCEPTED)
def request_email_verification(
    req: EmailActionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthActionResponse:
    """Send email verification instructions to the authenticated user."""
    ensure_email_delivery_configured()
    email = normalize_email(req.email)
    client_id = _client_rate_limit_id(request)
    _check_auth_rate_limit(
        "email-verification",
        f"{client_id}:{current_user.id}",
        EMAIL_VERIFICATION_RATE_LIMIT_ATTEMPTS,
        EMAIL_VERIFICATION_RATE_LIMIT_WINDOW,
    )
    if email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot verify a different email address")

    if current_user.email_verified_at is not None:
        return _auth_action_response()

    token = _create_user_action_token(current_user, EMAIL_VERIFICATION_PURPOSE, EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES)
    verification_url = _action_link("/verify-email", token)
    send_email_verification_email(current_user.email, verification_url)
    add_audit_event(
        db,
        "email_verification_requested",
        actor=current_user,
        target_user=current_user,
        metadata={"email": current_user.email},
        request=request,
    )
    db.commit()
    return _auth_action_response()


@router.post("/email-verification/confirm", response_model=MessageResponse)
def confirm_email_verification(
    req: VerifyEmailRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Verify a user's email using an email verification token."""
    _check_auth_rate_limit(
        "email-verification-confirm",
        _client_rate_limit_id(request),
        TOKEN_CONFIRM_RATE_LIMIT_ATTEMPTS,
        TOKEN_CONFIRM_RATE_LIMIT_WINDOW,
    )
    user_id, token_version = _decode_user_action_token(req.token, EMAIL_VERIFICATION_PURPOSE)
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while verifying the email address.",
        ) from exc

    if not user or not user.is_active or (user.auth_token_version or 0) != token_version:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    if user.email_verified_at is None:
        user.email_verified_at = datetime.utcnow()
        try:
            add_audit_event(
                db,
                "email_verified",
                actor=user,
                target_user=user,
                metadata={"email": user.email},
                request=request,
            )
            db.commit()
        except OperationalError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database connection failed while saving email verification.",
            ) from exc

    return MessageResponse(message="Email has been verified.")


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    """Login and get access token"""
    email = normalize_email(req.email)
    client_id = _client_rate_limit_id(request)
    _check_auth_rate_limit("login", f"{client_id}:{email}", LOGIN_RATE_LIMIT_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW)
    try:
        user = db.query(User).filter(User.email == email).first()
    except OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed while signing in. Check DATABASE_URL and Supabase credentials.",
        ) from exc

    if not user:
        add_audit_event(
            db,
            "login_failed",
            metadata={"email": email, "reason": "unknown_user"},
            request=request,
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        add_audit_event(
            db,
            "login_failed",
            actor=user,
            target_user=user,
            metadata={"email": email, "reason": "inactive_user"},
            request=request,
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    if user.login_cooldown_until is not None:
        if _is_future(user.login_cooldown_until):
            add_audit_event(
                db,
                "login_failed",
                actor=user,
                target_user=user,
                metadata={"email": email, "reason": "cooldown"},
                request=request,
            )
            db.commit()
            _raise_login_cooldown(user.login_cooldown_until)
        _clear_failed_login_state(user, db)

    if not verify_password(req.password, user.password_hash):
        _record_failed_login(user, db)
        add_audit_event(
            db,
            "login_failed",
            actor=user,
            target_user=user,
            metadata={
                "email": email,
                "reason": "incorrect_password",
                "failed_login_attempts": user.failed_login_attempts,
                "locked": user.login_cooldown_until is not None and _is_future(user.login_cooldown_until),
            },
            request=request,
        )
        db.commit()
        if user.login_cooldown_until is not None and _is_future(user.login_cooldown_until):
            _raise_login_cooldown(user.login_cooldown_until)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    _clear_failed_login_state(user, db)
    add_audit_event(
        db,
        "login_succeeded",
        actor=user,
        target_user=user,
        metadata={"email": email},
        request=request,
    )
    db.commit()

    access_token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        user_id=str(user.id),  # Convert UUID to string
        email=user.email,
        role=user.role
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(current_user: User = Depends(get_current_user)) -> TokenResponse:
    """Refresh access token"""
    access_token = create_access_token(data={"sub": str(current_user.id)})
    return TokenResponse(
        access_token=access_token,
        user_id=str(current_user.id),  # Convert UUID to string
        email=current_user.email,
        role=current_user.role
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Get current user information"""
    return UserResponse(
        id=str(current_user.id),  # Convert UUID to string
        email=current_user.email,
        role=current_user.role,
        created_at=current_user.created_at.isoformat(),
        email_verified=current_user.email_verified_at is not None,
    )
