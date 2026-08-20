from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwk, jwt

from .settings import settings

_security = HTTPBearer()
_jwks_lock = Lock()
_jwks: dict[str, Any] | None = None
_jwks_expires_at = datetime.min.replace(tzinfo=timezone.utc)
_JWKS_TTL = timedelta(hours=1)


@dataclass(frozen=True)
class SupabasePrincipal:
    id: UUID


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate Supabase credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _get_jwks() -> dict[str, Any]:
    global _jwks, _jwks_expires_at
    now = datetime.now(timezone.utc)
    with _jwks_lock:
        if _jwks is not None and now < _jwks_expires_at:
            return _jwks
        if not settings.supabase_url:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase JWT validation is not configured",
            )
        try:
            response = httpx.get(
                f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
                timeout=5.0,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase identity service is unavailable",
            ) from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("keys"), list):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase identity service returned an invalid key set",
            )
        _jwks = payload
        _jwks_expires_at = now + _JWKS_TTL
        return payload


def get_current_supabase_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> SupabasePrincipal:
    try:
        token = credentials.credentials
        header = jwt.get_unverified_header(token)
        key_id = header.get("kid")
        if not isinstance(key_id, str):
            raise _credentials_exception()
        key_data = next(
            (candidate for candidate in _get_jwks()["keys"] if candidate.get("kid") == key_id),
            None,
        )
        if not isinstance(key_data, dict):
            raise _credentials_exception()
        payload = jwt.decode(
            token,
            jwk.construct(key_data),
            algorithms=[str(header.get("alg", ""))],
            issuer=f"{settings.supabase_url}/auth/v1",
            options={"verify_aud": False},
        )
        subject = payload.get("sub")
        if payload.get("role") != "authenticated" or not isinstance(subject, str):
            raise _credentials_exception()
        return SupabasePrincipal(id=UUID(subject))
    except (JWTError, ValueError, TypeError):
        raise _credentials_exception()
