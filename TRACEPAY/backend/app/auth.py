import asyncio
import json
import logging
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import Header, HTTPException

from app.config import settings

logger = logging.getLogger("tracepay.auth")


def fetch_supabase_user(token: str, timeout: float = 10) -> dict[str, Any]:
    """Blocking Supabase Auth user lookup. Call only from a worker thread.

    Authorization must use app_metadata from this response. user_metadata is editable by the user.
    """
    project_url = settings.supabase_url.rstrip("/")
    publishable_key = settings.supabase_publishable_key()
    if not project_url or not publishable_key:
        logger.error("auth_unavailable reason=supabase_not_configured")
        raise HTTPException(status_code=503, detail="Supabase authentication is not configured.")

    request = Request(
        f"{project_url}/auth/v1/user",
        headers={"apikey": publishable_key, "Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            user = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        logger.warning(
            "auth_rejected reason=invalid_or_expired_token error_type=%s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=401,
            detail="The Supabase access token is invalid or expired.",
        ) from error

    if not isinstance(user, dict):
        logger.warning("auth_rejected reason=supabase_user_not_object")
        raise HTTPException(status_code=401, detail="The Supabase access token is invalid.")
    return user


def _fetch_supabase_user_id(token: str) -> str:
    """Blocking Supabase Auth user lookup. Call only from a worker thread."""
    user_id = fetch_supabase_user(token).get("id")
    if not isinstance(user_id, str) or not user_id:
        logger.warning("auth_rejected reason=supabase_user_missing_id")
        raise HTTPException(status_code=401, detail="The Supabase access token is invalid.")
    return user_id


async def require_supabase_user(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        logger.warning("auth_rejected reason=missing_bearer_token")
        raise HTTPException(status_code=401, detail="A Supabase access token is required.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        logger.warning("auth_rejected reason=empty_bearer_token")
        raise HTTPException(status_code=401, detail="A Supabase access token is required.")

    try:
        user_id = await asyncio.to_thread(_fetch_supabase_user_id, token)
    except HTTPException:
        raise

    logger.info("auth_accepted user_id_prefix=%s", user_id[:8])
    return user_id
