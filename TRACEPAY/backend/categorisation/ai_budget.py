"""Per-user daily budget for paid AI categorisation.

The count lives in the database (``public.consume_ai_budget``), so every backend instance
shares it and it survives restarts. A check that cannot reach the database raises
``AiBudgetUnavailable`` rather than allowing the call: the caller then falls back to rules.
"""

from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings

logger = logging.getLogger("tracepay.ai_budget")

WINDOW_SECONDS = 24 * 60 * 60
REQUEST_TIMEOUT_SECONDS = 5


class AiBudgetUnavailable(RuntimeError):
    """The budget could not be checked, so no paid AI call may be made."""


def consume_ai_budget(user_id: str, amount: int) -> bool:
    """Reserve ``amount`` transactions from the user's daily budget.

    Returns True when the reservation fits the budget (and records it), False when it
    would exceed it. Raises ``AiBudgetUnavailable`` when the database cannot be reached.
    """
    if amount <= 0:
        return True
    if not user_id:
        raise AiBudgetUnavailable("no user id")
    url = settings.supabase_url.strip().rstrip("/")
    key = settings.supabase_service_role_key.strip()
    if not url or not key:
        logger.error("ai_budget_unavailable reason=supabase_service_role_missing")
        raise AiBudgetUnavailable("missing Supabase configuration")

    payload = {
        "p_user_id": user_id,
        "p_amount": amount,
        "p_limit": settings.ai_daily_item_limit,
        "p_window_seconds": WINDOW_SECONDS,
    }
    request = Request(
        f"{url}/rest/v1/rpc/consume_ai_budget",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError) as error:
        logger.warning("ai_budget_check_failed error_type=%s", type(error).__name__)
        raise AiBudgetUnavailable("budget check failed") from error

    try:
        allowed = json.loads(body) if body else False
    except ValueError as error:
        logger.warning("ai_budget_check_failed error_type=ValueError")
        raise AiBudgetUnavailable("budget check returned an invalid response") from error
    if allowed is True:
        return True
    if allowed is False:
        logger.info("ai_budget_exhausted amount=%s limit=%s", amount, settings.ai_daily_item_limit)
        return False
    raise AiBudgetUnavailable("budget check returned an unexpected value")
