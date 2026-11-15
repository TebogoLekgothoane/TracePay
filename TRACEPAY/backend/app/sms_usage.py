"""Records each sign-in SMS (sent or failed, billed parts) for the superadmin dashboard.

Best effort and off the request path: a failure to record never affects sign-in. Only counts are
stored, never phone numbers, codes or message text.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings

logger = logging.getLogger("tracepay.sms_usage")

TIMEOUT_SECONDS = 5
OUTCOMES = ("sent", "failed")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="sms-usage")
_warned_missing_table = False


def message_parts(body: str) -> int:
    """Billed parts: 160 characters per single GSM message, 153 per part once it is split.
    Non-GSM text (unicode) is billed at 70 and 67; treated as unicode when any character is non-ASCII."""
    single, multi = (160, 153) if body.isascii() else (70, 67)
    length = len(body)
    return 1 if length <= single else -(-length // multi)


def _post(row: dict[str, Any]) -> None:
    global _warned_missing_table
    url = settings.supabase_url.strip().rstrip("/")
    key = settings.supabase_service_role_key.strip()
    if not url or not key:
        return
    request = Request(
        f"{url}/rest/v1/sms_usage_events",
        data=json.dumps(row).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS):
            pass
    except HTTPError as error:
        if error.code == 404 and not _warned_missing_table:
            _warned_missing_table = True
            logger.warning("sms_usage_not_recorded reason=table_missing migration=202611150003")
        elif error.code != 404:
            logger.warning("sms_usage_not_recorded status=%s", error.code)
    except (URLError, TimeoutError, OSError) as error:
        logger.warning("sms_usage_not_recorded error_type=%s", type(error).__name__)


def record_sms_usage(*, outcome: str, body: str) -> None:
    """Queue one usage row. Never raises."""
    try:
        if outcome not in OUTCOMES:
            return
        parts = message_parts(body) if outcome == "sent" else 0
        _executor.submit(_post, {"outcome": outcome, "parts": min(parts, 20)})
    except Exception:  # noqa: BLE001 - recording must never break sign-in
        logger.warning("sms_usage_not_recorded error_type=queue")
