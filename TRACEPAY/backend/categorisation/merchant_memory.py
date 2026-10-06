"""Merchant memory: reuse prior high-confidence classifications."""

from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings
from categorisation.constants import (
    MERCHANT_MEMORY_AI_MIN_CONFIDENCE,
    MERCHANT_MEMORY_MIN_CONFIDENCE,
)
from categorisation.models import CategorisationResult
from categorisation.normalize import merchant_key

logger = logging.getLogger("tracepay.categorisation.memory")


class MerchantMemory:
    """In-run memory plus optional prior classifications loaded from Supabase."""

    def __init__(self, prior: dict[str, CategorisationResult] | None = None) -> None:
        self._store: dict[str, CategorisationResult] = dict(prior or {})

    def get(self, merchant: str | None) -> CategorisationResult | None:
        key = merchant_key(merchant)
        if not key:
            return None
        return self._store.get(key)

    def remember(self, merchant: str | None, result: CategorisationResult) -> None:
        key = merchant_key(merchant or result.merchant_name)
        if not key or not _eligible_for_memory(result):
            return
        existing = self._store.get(key)
        if existing and existing.classification_confidence >= result.classification_confidence:
            return
        self._store[key] = result.model_copy(
            update={
                "rule": result.rule or "merchant_memory",
                "classification_reason": f"Matched known merchant: {result.merchant_name or key}",
                "merchant_name": result.merchant_name or merchant,
            }
        )

    def __len__(self) -> int:
        return len(self._store)


def _eligible_for_memory(result: CategorisationResult) -> bool:
    if not result.category_name:
        return False
    if result.category_name.casefold() == "other":
        return False
    if (result.rule or "").startswith("fallback"):
        return False
    confidence = max(result.classification_confidence, result.category_confidence)
    if (result.rule or "").startswith("ai:"):
        return confidence >= MERCHANT_MEMORY_AI_MIN_CONFIDENCE
    return confidence >= MERCHANT_MEMORY_MIN_CONFIDENCE


def fetch_merchant_memory(access_token: str | None) -> MerchantMemory:
    """Load prior high-confidence merchant classifications for the authenticated user."""
    if not access_token:
        return MerchantMemory()
    project_url = settings.supabase_url.rstrip("/")
    publishable_key = settings.supabase_publishable_key()
    if not project_url or not publishable_key:
        logger.info("[MERCHANT_MEMORY] skipped reason=missing_supabase_config")
        return MerchantMemory()

    # Prefer rows that already have a merchant_name and usable classification.
    query = (
        f"{project_url}/rest/v1/transactions"
        "?select=merchant_name,category_rule,transaction_class,classification_confidence,"
        "category_confidence,categories(name)"
        "&merchant_name=not.is.null"
        "&category_id=not.is.null"
        "&is_duplicate=eq.false"
        f"&classification_confidence=gte.{MERCHANT_MEMORY_MIN_CONFIDENCE}"
        "&order=categorized_at.desc.nullslast"
        "&limit=500"
    )
    request = Request(
        query,
        headers={
            "apikey": publishable_key,
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=10) as response:
            rows = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        status = getattr(error, "code", None)
        # Older schemas without merchant_name return 400 — treat as empty memory.
        logger.warning(
            "[MERCHANT_MEMORY] load_failed error_type=%s status=%s",
            type(error).__name__,
            status,
        )
        return MerchantMemory()

    prior: dict[str, CategorisationResult] = {}
    if not isinstance(rows, list):
        return MerchantMemory()
    for row in rows:
        if not isinstance(row, dict):
            continue
        merchant = row.get("merchant_name")
        categories = row.get("categories")
        category_name = None
        if isinstance(categories, dict):
            category_name = categories.get("name")
        elif isinstance(categories, list) and categories:
            first = categories[0]
            if isinstance(first, dict):
                category_name = first.get("name")
        if not isinstance(merchant, str) or not isinstance(category_name, str):
            continue
        rule = row.get("category_rule") if isinstance(row.get("category_rule"), str) else "merchant_memory"
        try:
            confidence = float(row.get("classification_confidence") or row.get("category_confidence") or 0)
        except (TypeError, ValueError):
            confidence = 0
        transaction_class = row.get("transaction_class") if isinstance(row.get("transaction_class"), str) else "spending"
        result = CategorisationResult(
            category_name=category_name,
            category_confidence=confidence,
            transaction_class=transaction_class,  # type: ignore[arg-type]
            classification_confidence=confidence,
            classification_reason=f"Matched known merchant: {merchant}",
            merchant_name=merchant,
            rule=rule if rule.startswith(("merchant:", "description:", "ai:")) else "merchant_memory",
        )
        if not _eligible_for_memory(result):
            continue
        key = merchant_key(merchant)
        if key and key not in prior:
            prior[key] = result
    logger.info("[MERCHANT_MEMORY] loaded_entries=%s", len(prior))
    return MerchantMemory(prior)
