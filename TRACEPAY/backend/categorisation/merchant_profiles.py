"""Identify what kind of business an unfamiliar payee is, once, for every user.

Rules only know names someone has written down. For a payee the rules cannot place, a model is
asked what kind of business it is (trading broker, gambling site, lender, shop, ...). The answer
is shared in the ``merchant_profiles`` table, so each name is paid for once, and is used by both
the categoriser (import time) and the leak analysis.

Privacy and safety:
- only the payee's name is sent: no amounts, dates, account numbers or user ids;
- a name is only sent when it looks like a business (a reference number, a domain, a company
  suffix) or the rules call an unrecognised card or online purchase merchant. A plain
  "Firstname Surname" transfer is a person and is never sent;
- an answer under 70% confidence is ignored; the model may answer "unknown";
- the model's answer never overrides a category the rules already assigned;
- every failure is swallowed so an import or analysis never breaks because of this step.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Callable
from threading import Lock
from typing import Iterable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.ai_usage import record_ai_usage
from app.config import settings
from categorisation.ai_budget import AiBudgetUnavailable
from categorisation.ai_classifier import (
    _chat_response_text,
    _configured_model,
    _request_openai,
    _request_openrouter,
    _request_xai,
)
from categorisation.constants import FALLBACK_CATEGORY
from categorisation.merchant_directory import MerchantDirectory, pattern_key_for
from categorisation.models import CategorisationResult
from categorisation.normalize import (
    extract_merchant_name,
    is_bank_boilerplate_label,
    normalize_for_matching,
)
from categorisation.resolve import ensure_complete_classification, resolve_category_name
from categorisation.rules import recognised_merchant_label
from categorisation.sanitizer import sanitize_for_ai
from categorisation.source_identity import identify_source

logger = logging.getLogger("tracepay.categorisation.profiles")

FEATURE = "merchant_type"
TABLE = "merchant_profiles"
MAX_NAMES_PER_RUN = 40
MIN_CONFIDENCE = 0.7
CACHE_MAX = 5000
_TIMEOUT_SECONDS = 8

BUSINESS_TYPES = (
    "trading_broker",
    "crypto_exchange",
    "gambling",
    "short_term_lender",
    "loan_provider",
    "insurance",
    "subscription_service",
    "retailer",
    "food_and_drink",
    "telecom_or_utility",
    "transport",
    "bank_or_fintech",
    "education",
    "person",
    "other_business",
    "unknown",
)
TRADING_TYPES = frozenset({"trading_broker", "crypto_exchange"})

# business type -> (transaction class, category). Only applied to a payee whose class or category
# the rules left unresolved.
_PROFILE_OUTCOME: dict[str, tuple[str, str]] = {
    "trading_broker": ("investment", FALLBACK_CATEGORY),
    "crypto_exchange": ("investment", FALLBACK_CATEGORY),
    "gambling": ("spending", "Gambling"),
    "short_term_lender": ("spending", "Loans & Credit"),
    "loan_provider": ("spending", "Loans & Credit"),
    "insurance": ("spending", "Insurance"),
    "subscription_service": ("spending", "Subscriptions"),
    "retailer": ("spending", "Shopping"),
    "food_and_drink": ("spending", "Restaurants"),
    "telecom_or_utility": ("spending", "Utilities"),
    "transport": ("spending", "Transport"),
    "education": ("spending", "Education"),
    "other_business": ("spending", FALLBACK_CATEGORY),
}

_known: dict[str, str] = {}  # name (casefold) -> business type, shared by every user
_lock = Lock()


def known_type(name: str | None) -> str | None:
    """The business type identified for this payee name, if one has been."""
    if not name:
        return None
    with _lock:
        return _known.get(" ".join(name.split()).casefold())

# "Capitec Pay Payment: Name (123456)": a name followed by the bank's reference number is a
# merchant paid through the bank's pay-by-ID, not a person. Up to four words.
_REFERENCED = re.compile(
    r"(?:capitec pay|card purchase|online purchase|pay by id|payshap)[^:\n]{0,48}:\s*"
    r"([A-Za-z][A-Za-z0-9&'.-]*(?:\s+[A-Za-z0-9&'.-]+){0,3}?)\s*\(\d{5,}\)",
    re.IGNORECASE,
)
_DOMAIN = re.compile(r"\b([a-z0-9-]{2,30})\.(?:com|co\.za|net|io|org|app|trade|exchange)\b", re.IGNORECASE)
_COMPANY_SUFFIX = re.compile(r"\b(?:pty|ltd|limited|inc|llc|plc|cc)\b\.?", re.IGNORECASE)
_NOT_A_NAME = frozenset({"payment", "pay", "transfer", "fee", "purchase", "card", "unknown"})

_SCHEMA = {
    "type": "object",
    "properties": {
        "merchants": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "business_type": {"type": "string", "enum": list(BUSINESS_TYPES)},
                    "what_they_do": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["name", "business_type", "what_they_do", "confidence"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["merchants"],
    "additionalProperties": False,
}

_INSTRUCTIONS = (
    "You identify businesses from the name a customer paid, as printed on a bank statement "
    "(South African banks, but names may be international). For each name say what kind of "
    "business it is. An online forex, CFD or binary-options broker is trading_broker; a crypto "
    "exchange or wallet is crypto_exchange; a betting site, casino or lottery is gambling; an "
    "online or short-term cash-loan or payday lender (such as Wonga, Fasta or Bizmula) is "
    "short_term_lender; any other lender, store credit or buy-now-pay-later is loan_provider. "
    "Use person when the name is just an "
    "individual's name. Use unknown whenever you are not sure; never guess and never invent. The "
    "name may be shortened or a trading name rather than the legal name. confidence is how sure "
    "you are the type is right. what_they_do is one short plain sentence, empty when unknown.\n\n"
    "Names: "
)


def needs_identity(transaction_class: str | None, category_name: str | None) -> bool:
    """True when the rules left the payee unresolved (so a profile may help)."""
    if transaction_class in (None, "unknown", "person_to_person"):
        return True
    return (category_name or FALLBACK_CATEGORY).casefold() == FALLBACK_CATEGORY.casefold()


def payee_label(
    description: str | None,
    *,
    transaction_class: str | None = None,
    category_name: str | None = None,
) -> str | None:
    """The business-like payee name to identify, or None (a person, a known shop, bank wording)."""
    if not description or not needs_identity(transaction_class, category_name):
        return None
    name: str | None = None
    match = _REFERENCED.search(description)
    if match:
        name = " ".join(match.group(1).split())
    else:
        domain = _DOMAIN.search(description)
        if domain:
            name = domain.group(1)
        elif _COMPANY_SUFFIX.search(description):
            name = extract_merchant_name(description)
        else:
            identity = identify_source(description)
            # An unrecognised card or online merchant: the rules have no label for it.
            if (
                identity.source_type in {"unknown", "merchant"}
                and identity.identification_method != "deterministic:catalogue"
                and transaction_class != "person_to_person"
            ):
                name = extract_merchant_name(description)
    if not name:
        return None
    name = re.sub(r"\s+", " ", _COMPANY_SUFFIX.sub("", name)).strip(" .,-")
    if not 3 <= len(name) <= 40 or name.casefold() in _NOT_A_NAME or is_bank_boilerplate_label(name):
        return None
    if recognised_merchant_label(normalize_for_matching(name) or name.upper()):
        return None
    return name


def type_for_description(description: str | None) -> str | None:
    """The business type resolved for this row's payee in the current analysis, if any."""
    label = payee_label(description, transaction_class="unknown")
    return known_type(label) if label else None


def _clean_name(raw: str) -> str:
    return sanitize_for_ai(raw).strip()[:40]


def _directory_lookup(keys: list[str]) -> dict[str, tuple[str, float]]:
    helper = MerchantDirectory()
    if not helper.enabled() or not keys:
        return {}
    found: dict[str, tuple[str, float]] = {}
    wanted = sorted({key for key in keys if '"' not in key and "\\" not in key})
    for offset in range(0, len(wanted), 100):
        chunk = wanted[offset : offset + 100]
        in_list = ",".join(f'"{key}"' for key in chunk)
        url = (
            f"{settings.supabase_url.rstrip('/')}/rest/v1/{TABLE}"
            f"?select=pattern_key,business_type,confidence&pattern_key=in.({quote(in_list, safe='')})"
        )
        try:
            request = Request(url, headers=helper._headers(), method="GET")
            with urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
                rows = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
            logger.warning("[PROFILES] lookup_failed error_type=%s", type(error).__name__)
            continue
        for row in rows if isinstance(rows, list) else []:
            if (
                isinstance(row, dict)
                and isinstance(row.get("pattern_key"), str)
                and row.get("business_type") in BUSINESS_TYPES
            ):
                try:
                    found[row["pattern_key"]] = (row["business_type"], float(row.get("confidence")))
                except (TypeError, ValueError):
                    continue
    return found


def _directory_store(entries: list[tuple[str, str, float]]) -> None:
    helper = MerchantDirectory()
    if not helper.enabled() or not entries:
        return
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    body = [
        {
            "pattern_key": key,
            "business_type": kind,
            "confidence": round(confidence, 3),
            "source": "ai",
            "updated_at": now,
        }
        for key, kind, confidence in entries
    ]
    headers = {**helper._headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
    try:
        request = Request(
            f"{settings.supabase_url.rstrip('/')}/rest/v1/{TABLE}?on_conflict=pattern_key",
            data=json.dumps(body).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urlopen(request, timeout=_TIMEOUT_SECONDS):
            pass
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
        logger.warning("[PROFILES] store_failed error_type=%s", type(error).__name__)


def _ask_model(names: list[str]):
    openrouter, openai, xai = settings.categorisation_provider_keys()
    providers = []
    if openrouter:
        providers.append(("openrouter", _request_openrouter))
    if openai:
        providers.append(("openai", _request_openai))
    if xai:
        providers.append(("xai", _request_xai))
    instructions = _INSTRUCTIONS + json.dumps([_clean_name(n) for n in names])
    for provider, requester in providers:
        started = time.perf_counter()
        output = None
        parsed = None
        try:
            output = requester(instructions, _SCHEMA, len(names))
            parsed = json.loads(_chat_response_text(output, provider)) if output else None
        except Exception as error:  # noqa: BLE001 - identification must never fail an import
            logger.warning("[PROFILES] model_failed provider=%s error_type=%s", provider, type(error).__name__)
        record_ai_usage(
            feature=FEATURE,
            provider=provider,
            model=_configured_model(provider),
            outcome="success" if parsed else "failed",
            items=len(names),
            payload=output,
            duration_ms=(time.perf_counter() - started) * 1000,
        )
        if parsed:
            return parsed
    return None


def resolve_payee_types(
    names: Iterable[str], allowed: Callable[[int], bool] | None
) -> Mapping[str, str]:
    """Business types for these payee names (name casefold -> type). Never raises."""
    try:
        return _resolve(list(dict.fromkeys(names)), allowed)
    except Exception as error:  # noqa: BLE001 - optional enrichment
        logger.warning("[PROFILES] resolve_failed error_type=%s", type(error).__name__)
        return {}


def _resolve(names: list[str], allowed: Callable[[int], bool] | None) -> Mapping[str, str]:
    if not names:
        return {}
    with _lock:
        pending = [n for n in names if n.casefold() not in _known]
    keys = {n: pattern_key_for(n) for n in pending}
    hits = _directory_lookup([k for k in keys.values() if k])
    with _lock:
        for name in pending:
            hit = hits.get(keys[name] or "")
            if hit and hit[1] >= MIN_CONFIDENCE:
                _known[name.casefold()] = hit[0]
        pending = [n for n in pending if n.casefold() not in _known][:MAX_NAMES_PER_RUN]
    if pending and settings.ai_categorisation_enabled and any(settings.categorisation_provider_keys()):
        try:
            permitted = True if allowed is None else allowed(len(pending))
        except AiBudgetUnavailable:
            permitted = False
        if permitted:
            _record_answers(pending, keys, _ask_model(pending))
    with _lock:
        return {n.casefold(): _known[n.casefold()] for n in names if n.casefold() in _known}


def _record_answers(asked: list[str], keys: dict[str, str | None], parsed: object) -> None:
    items = parsed.get("merchants") if isinstance(parsed, dict) else None
    answered: dict[str, tuple[str, float]] = {}
    if isinstance(items, list):
        by_clean = {_clean_name(n).casefold(): n for n in asked}
        for item in items:
            if not isinstance(item, dict):
                continue
            name = by_clean.get(_clean_name(str(item.get("name", ""))).casefold())
            kind = item.get("business_type")
            try:
                confidence = float(item.get("confidence", 0))
            except (TypeError, ValueError):
                continue
            if name is not None and kind in BUSINESS_TYPES:
                answered[name] = (kind if confidence >= MIN_CONFIDENCE else "unknown", confidence)
    shared: list[tuple[str, str, float]] = []
    with _lock:
        for name in asked:
            kind, confidence = answered.get(name, ("unknown", 0.0))
            # Asked-but-unanswered names are remembered as unknown so they are not re-asked.
            _known[name.casefold()] = kind
            # People are never written to the shared table.
            if kind not in ("unknown", "person") and keys.get(name):
                shared.append((keys[name] or "", kind, confidence))
        while len(_known) > CACHE_MAX:
            _known.pop(next(iter(_known)))
    _directory_store(shared)


def reclassify_feature_transactions(transactions: list, user_id: str) -> list:
    """Return the user's transactions with unresolved payees re-classified by business type.

    Runs before any feature or finding is derived, so the engine, the statement review and the
    totals all see an identified lender, broker or shop the same way. Rows that need nothing
    are returned untouched; any failure returns the input unchanged.
    """
    from dataclasses import replace

    try:
        from categorisation.ai_budget import consume_ai_budget

        results = {tx.transaction_id: tx.categorisation for tx in transactions}
        rows = [
            (tx.transaction_id, tx.description, tx.transaction_type or "debit")
            for tx in transactions
        ]
        before = dict(results)
        apply_profiles(rows, results, set(), lambda amount: consume_ai_budget(user_id, amount))
        return [
            replace(tx, categorisation=results[tx.transaction_id], merchant_name=results[tx.transaction_id].merchant_name)
            if results[tx.transaction_id] is not before[tx.transaction_id]
            else tx
            for tx in transactions
        ]
    except Exception as error:  # noqa: BLE001 - optional enrichment
        logger.warning("[PROFILES] reclassify_failed error_type=%s", type(error).__name__)
        return transactions


def apply_profiles(
    rows: list[tuple[str, str, str]],
    results: dict[str, CategorisationResult],
    catalog: set[str],
    allowed: Callable[[int], bool] | None,
) -> int:
    """Re-classify payees the rules left unresolved, using the identified business type.

    ``rows`` is (transaction id, description, transaction type). Only debits whose class or
    category is unresolved are touched. Returns how many results changed.
    """
    labels: dict[str, str] = {}
    for transaction_id, description, kind in rows:
        current = results.get(transaction_id)
        if current is None or kind != "debit":
            continue
        label = payee_label(
            description,
            transaction_class=current.transaction_class,
            category_name=current.category_name,
        )
        if label:
            labels[transaction_id] = label
    if not labels:
        return 0
    types = resolve_payee_types(labels.values(), allowed)
    changed = 0
    for transaction_id, label in labels.items():
        outcome = _PROFILE_OUTCOME.get(types.get(label.casefold(), ""))
        if outcome is None:
            continue
        transaction_class, category = outcome
        current = results[transaction_id]
        resolved_category = resolve_category_name(category, catalog) if catalog else category
        results[transaction_id] = ensure_complete_classification(
            current.model_copy(
                update={
                    "transaction_class": transaction_class,
                    "category_name": resolved_category or FALLBACK_CATEGORY,
                    "classification_confidence": max(current.classification_confidence, 0.8),
                    "category_confidence": max(current.category_confidence, 0.8),
                    "classification_reason": (
                        f"{label} identified as {types[label.casefold()].replace('_', ' ')}"
                    ),
                    "merchant_name": label,
                    "rule": "ai:merchant_profile",
                }
            ),
            catalog,
            merchant_name=label,
        )
        changed += 1
    return changed
