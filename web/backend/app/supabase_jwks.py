from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import httpx

from .settings import settings

# Supabase projects that have migrated to per-key rotating signing keys sign
# access tokens asymmetrically (ES256) and publish the public verification
# keys here -- there is no shared secret to verify these with, unlike the
# legacy HS256 project-wide JWT secret. Cached with a TTL since keys rotate
# rarely; a cache miss on an unknown `kid` forces one refresh before giving up
# (covers the case where a key rotated since our last fetch).
_CACHE_TTL_SECONDS = 3600.0

_cache: Dict[str, Any] = {"keys": None, "fetched_at": 0.0}


def _fetch_jwks() -> List[dict]:
    response = httpx.get(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", timeout=5.0)
    response.raise_for_status()
    return response.json().get("keys", [])


def get_jwks(force_refresh: bool = False) -> List[dict]:
    now = time.time()
    if force_refresh or _cache["keys"] is None or now - _cache["fetched_at"] > _CACHE_TTL_SECONDS:
        _cache["keys"] = _fetch_jwks()
        _cache["fetched_at"] = now
    return _cache["keys"]


def find_key_for_kid(kid: str) -> Optional[dict]:
    for key in get_jwks():
        if key.get("kid") == kid:
            return key
    for key in get_jwks(force_refresh=True):
        if key.get("kid") == kid:
            return key
    return None
