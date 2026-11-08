"""Shared merchant directory: pay for each unfamiliar statement description once, for everyone.

When the optional AI categoriser identifies a merchant from a description, the answer is kept in a
global table keyed by the normalised description text. Later users (and later imports) get the
stored answer with no AI call.

Privacy rules, enforced in `entry_for` before anything is stored:
- only the normalised description text, a merchant name and a category are kept; no amounts,
  dates, user ids or transaction ids;
- only verified merchants paid by debit are kept, never people, transfers or income;
- descriptions containing redacted phone, account or reference tokens are never kept.

Every failure here is swallowed: the directory is an optimisation and must never break an import.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.config import settings
from categorisation.constants import FALLBACK_CATEGORY, MERCHANT_MEMORY_AI_MIN_CONFIDENCE
from categorisation.models import CategorisationResult
from categorisation.normalize import is_bank_boilerplate_label, merchant_key, normalize_for_matching
from categorisation.sanitizer import sanitize_for_ai

logger = logging.getLogger("tracepay.categorisation.directory")

TABLE = "merchant_directory"
RULE = "merchant_directory"
MIN_KEY_LENGTH = 3
MAX_KEY_LENGTH = 80
_LOOKUP_CHUNK = 100
_TIMEOUT_SECONDS = 8


@dataclass(frozen=True)
class DirectoryEntry:
    pattern_key: str
    merchant_name: str
    category_name: str
    confidence: float


def pattern_key_for(description: str | None) -> str | None:
    """Stable, shareable key for a description, or None when it must not be shared."""
    sanitised = sanitize_for_ai(description)
    if not sanitised or "[" in sanitised:  # phone / account / reference was redacted
        return None
    key = normalize_for_matching(description)
    if not (MIN_KEY_LENGTH <= len(key) <= MAX_KEY_LENGTH):
        return None
    if '"' in key or "\\" in key:
        return None
    return key


def entry_for(description: str | None, result: CategorisationResult) -> DirectoryEntry | None:
    """Return the entry to share for an AI result, or None if it is not safe to share."""
    key = pattern_key_for(description)
    if key is None:
        return None
    if not (result.rule or "").startswith("ai:") or result.transaction_class != "spending":
        return None
    merchant = (result.merchant_name or "").strip()
    category = (result.category_name or "").strip()
    if not merchant or not category or category.casefold() == FALLBACK_CATEGORY.casefold():
        return None
    if is_bank_boilerplate_label(merchant) or not merchant_key(merchant):
        return None
    # The merchant must be visible in the description it is stored against, so a wrong or
    # invented answer cannot be attached to an unrelated description for everyone.
    haystack = key.casefold()
    tokens = [token for token in normalize_for_matching(merchant).casefold().split() if len(token) >= 3]
    if not tokens or not any(token in haystack for token in tokens):
        return None
    confidence = min(result.classification_confidence, result.category_confidence)
    if confidence < MERCHANT_MEMORY_AI_MIN_CONFIDENCE:
        return None
    return DirectoryEntry(key, merchant[:120], category[:80], round(confidence, 3))


def _result_from_row(row: dict) -> CategorisationResult | None:
    merchant = row.get("merchant_name")
    category = row.get("category_name")
    if not isinstance(merchant, str) or not isinstance(category, str):
        return None
    try:
        confidence = float(row.get("confidence"))
    except (TypeError, ValueError):
        return None
    if not 0 <= confidence <= 1:
        return None
    return CategorisationResult(
        category_name=category,
        category_confidence=confidence,
        transaction_class="spending",
        classification_confidence=confidence,
        classification_reason=f"Matched shared merchant directory: {merchant}",
        merchant_name=merchant,
        rule=RULE,
    )


class MerchantDirectory:
    """Service-role client for the shared table. Disabled unless explicitly configured."""

    @staticmethod
    def enabled() -> bool:
        return bool(
            settings.merchant_directory_enabled
            and settings.supabase_url.strip()
            and settings.supabase_service_role_key.strip()
        )

    def _headers(self) -> dict[str, str]:
        key = settings.supabase_service_role_key.strip()
        return {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _url(self, query: str = "") -> str:
        return f"{settings.supabase_url.rstrip('/')}/rest/v1/{TABLE}{query}"

    def lookup(self, keys: list[str]) -> dict[str, CategorisationResult]:
        if not self.enabled():
            return {}
        wanted = sorted({key for key in keys if key and '"' not in key and "\\" not in key})
        found: dict[str, CategorisationResult] = {}
        for offset in range(0, len(wanted), _LOOKUP_CHUNK):
            chunk = wanted[offset : offset + _LOOKUP_CHUNK]
            in_list = ",".join(f'"{key}"' for key in chunk)
            query = (
                "?select=pattern_key,merchant_name,category_name,confidence"
                f"&pattern_key=in.({quote(in_list, safe='')})"
            )
            try:
                request = Request(self._url(query), headers=self._headers(), method="GET")
                with urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
                    rows = json.loads(response.read().decode("utf-8"))
            except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
                logger.warning("[DIRECTORY] lookup_failed error_type=%s", type(error).__name__)
                continue
            for row in rows if isinstance(rows, list) else []:
                if not isinstance(row, dict) or not isinstance(row.get("pattern_key"), str):
                    continue
                result = _result_from_row(row)
                if result is not None:
                    found[row["pattern_key"]] = result
        logger.info("[DIRECTORY] lookup keys=%s hits=%s", len(wanted), len(found))
        return found

    def store(self, entries: list[DirectoryEntry]) -> int:
        if not self.enabled() or not entries:
            return 0
        now = datetime.now(timezone.utc).isoformat()
        body = [
            {
                "pattern_key": entry.pattern_key,
                "merchant_name": entry.merchant_name,
                "category_name": entry.category_name,
                "transaction_class": "spending",
                "confidence": entry.confidence,
                "source": "ai",
                "updated_at": now,
            }
            for entry in entries
        ]
        headers = {**self._headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
        try:
            request = Request(
                self._url("?on_conflict=pattern_key"),
                data=json.dumps(body).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urlopen(request, timeout=_TIMEOUT_SECONDS):
                pass
        except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
            logger.warning("[DIRECTORY] store_failed error_type=%s", type(error).__name__)
            return 0
        logger.info("[DIRECTORY] stored entries=%s", len(entries))
        return len(entries)
