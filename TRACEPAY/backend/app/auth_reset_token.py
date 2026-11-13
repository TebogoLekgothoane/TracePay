"""Signed, single-use password-reset tokens (HMAC-SHA256). Port of the former Node reset-token module."""

import base64
import hashlib
import hmac
import secrets
import threading
import time

from app.auth_errors import AuthError
from app.config import settings

RESET_TOKEN_TTL_MS = 10 * 60 * 1000
_EXPIRED = "Verification session expired. Please start again."

# jti -> expiry (ms). Single-use within this process.
_used_ids: dict[str, int] = {}
_lock = threading.Lock()


def _secret() -> str:
    secret = settings.auth_reset_token_secret.strip()
    if len(secret) < 32:
        raise AuthError(
            503,
            "Auth server is missing AUTH_RESET_TOKEN_SECRET. Set a secret of at least 32 characters.",
        )
    return secret


def _sign(payload: str) -> str:
    digest = hmac.new(_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def create_reset_token(user_id: str, phone: str, now_ms: int | None = None) -> str:
    now = int(time.time() * 1000) if now_ms is None else now_ms
    expires_at = now + RESET_TOKEN_TTL_MS
    jti = secrets.token_hex(16)
    payload = f"{user_id}.{phone}.{expires_at}.{jti}"
    return f"{payload}.{_sign(payload)}"


def consume_reset_token(token: str, phone: str, now_ms: int | None = None) -> str:
    now = int(time.time() * 1000) if now_ms is None else now_ms
    parts = token.split(".")
    if len(parts) != 5:
        raise AuthError(400, _EXPIRED)
    user_id, token_phone, expires_raw, jti, signature = parts
    if not user_id or token_phone != phone or not expires_raw or not jti or not signature:
        raise AuthError(400, _EXPIRED)

    try:
        expires_at = int(expires_raw)
    except ValueError:
        raise AuthError(400, _EXPIRED) from None
    if expires_at < now:
        raise AuthError(400, _EXPIRED)

    expected = _sign(f"{user_id}.{phone}.{expires_raw}.{jti}")
    if not hmac.compare_digest(expected, signature):
        raise AuthError(400, _EXPIRED)

    with _lock:
        for used_jti, used_expiry in list(_used_ids.items()):
            if used_expiry < now:
                del _used_ids[used_jti]
        if jti in _used_ids:
            raise AuthError(400, _EXPIRED)
        _used_ids[jti] = expires_at
    return user_id


def clear_used_reset_tokens_for_tests() -> None:
    with _lock:
        _used_ids.clear()
