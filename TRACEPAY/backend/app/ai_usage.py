"""Records each paid AI call (feature, model, tokens, outcome) for the superadmin dashboard.

Best effort and off the request path: a failure to record never affects an import or a report.
Only counts and token totals are stored. Prompts, responses, descriptions and user ids are not.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings

logger = logging.getLogger("tracepay.ai_usage")

TIMEOUT_SECONDS = 5
OUTCOMES = ("success", "rejected", "failed")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ai-usage")
_warned_missing_table = False


def _count(value: object) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def token_usage(payload: object) -> tuple[int, int, int]:
    """Read (prompt, completion, total) from an OpenAI-compatible chat response."""
    usage = payload.get("usage") if isinstance(payload, dict) else None
    if not isinstance(usage, dict):
        return 0, 0, 0
    prompt = _count(usage.get("prompt_tokens"))
    completion = _count(usage.get("completion_tokens"))
    total = _count(usage.get("total_tokens")) or prompt + completion
    return prompt, completion, total


def response_model(payload: object, fallback: str) -> str:
    model = payload.get("model") if isinstance(payload, dict) else None
    return model.strip()[:120] if isinstance(model, str) and model.strip() else (fallback or "unknown")[:120]


def _post(row: dict[str, Any]) -> None:
    global _warned_missing_table
    url = settings.supabase_url.strip().rstrip("/")
    key = settings.supabase_service_role_key.strip()
    if not url or not key:
        return
    request = Request(
        f"{url}/rest/v1/ai_usage_events",
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
            logger.warning("ai_usage_not_recorded reason=table_missing migration=202611140002")
        elif error.code != 404:
            logger.warning("ai_usage_not_recorded status=%s", error.code)
    except (URLError, TimeoutError, OSError) as error:
        logger.warning("ai_usage_not_recorded error_type=%s", type(error).__name__)


def record_ai_usage(
    *,
    feature: str,
    provider: str,
    model: str,
    outcome: str,
    items: int = 0,
    payload: object = None,
    duration_ms: float | None = None,
) -> None:
    """Queue one usage row. Never raises."""
    try:
        if outcome not in OUTCOMES:
            return
        prompt, completion, total = token_usage(payload)
        row = {
            "feature": feature[:60],
            "provider": provider[:40],
            "model": response_model(payload, model),
            "outcome": outcome,
            "items": max(0, int(items)),
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": total,
            "duration_ms": int(duration_ms) if duration_ms is not None else None,
        }
        _executor.submit(_post, row)
    except Exception:  # noqa: BLE001 - recording must never break the caller
        logger.warning("ai_usage_not_recorded error_type=queue")
