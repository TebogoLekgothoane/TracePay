from __future__ import annotations

from typing import Any, Dict

import httpx

from .external_http import request_with_retries
from .settings import settings


class SupabaseAdminError(Exception):
    """Raised for any failure calling Supabase's Admin API -- carries the
    HTTP status Supabase responded with (or 503 if not configured at all)
    so callers can map it straight onto an HTTPException."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _require_configured() -> None:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise SupabaseAdminError(
            "Admin account provisioning is not configured (SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY missing on the backend).",
            status_code=503,
        )


def _admin_headers() -> Dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }


async def invite_user_by_email(email: str, role: str) -> Dict[str, Any]:
    """Create a new Supabase Auth user by email invite (admin-provisioned
    only -- there is no self-service signup for admin/investor/partner
    accounts). Supabase emails the invitee a magic link to set their own
    password; this only creates the `auth.users` row and returns it.
    Setting `profiles.role` is the caller's job, same as bootstrap-admin.
    """
    _require_configured()

    try:
        response = await request_with_retries(
            "POST",
            f"{settings.supabase_url}/auth/v1/invite",
            headers=_admin_headers(),
            json={"email": email, "data": {"invited_role": role}},
            retries=2,
        )
    except httpx.HTTPStatusError as exc:
        try:
            body = exc.response.json()
        except ValueError:
            body = {}
        detail = body.get("msg") or body.get("error_description") or body.get("message") or exc.response.text
        raise SupabaseAdminError(detail, status_code=exc.response.status_code) from exc
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        raise SupabaseAdminError(f"Could not reach Supabase: {exc}", status_code=503) from exc

    return response.json()
