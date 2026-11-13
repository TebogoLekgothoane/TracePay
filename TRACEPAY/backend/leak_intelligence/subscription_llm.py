"""Optional OpenRouter labelling for subscription detection.

Off unless SUBSCRIPTION_LLM_ENABLED=true and SUBSCRIPTION_LLM_MODEL pins a
model. The LLM can only (a) name unknown merchant strings and (b) write a
short reason for a group. It never sets amounts, dates, cadence or row
classes, and any failure falls back to the deterministic result.

Data sent (POPIA): normalised merchant strings with references, phone and
long numbers already removed, and per-group amounts, dates and counts. Never
names, account numbers, balances or statement text.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings

from .models import SubscriptionGroup

logger = logging.getLogger(__name__)

PROMPT_VERSION = "subscription-labels-v1"
_CANONICAL = re.compile(r"^[a-z0-9][a-z0-9_]{1,39}$")
_UNSAFE = re.compile(r"\d{4,}|@|\+\d")
_MAX_STRINGS = 40

_cache: dict[str, dict[str, Any]] = {}
_cache_lock = Lock()

_MERCHANT_SCHEMA = {
    "type": "object",
    "properties": {
        "merchants": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "input": {"type": "string"},
                    "canonical_name": {"type": ["string", "null"]},
                    "display_name": {"type": ["string", "null"]},
                },
                "required": ["input", "canonical_name", "display_name"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["merchants"],
    "additionalProperties": False,
}

_REASON_SCHEMA = {
    "type": "object",
    "properties": {"reason": {"type": "string"}},
    "required": ["reason"],
    "additionalProperties": False,
}


def _enabled() -> bool:
    return bool(
        settings.subscription_llm_enabled
        and settings.subscription_llm_model.strip()
        and settings.openrouter_api_key.strip()
    )


def _key(kind: str, payload: str) -> str:
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{PROMPT_VERSION}:{settings.subscription_llm_model.strip()}:{kind}:{digest}"


def _request(prompt: str, schema: dict, name: str) -> dict | None:
    body = json.dumps({
        "model": settings.subscription_llm_model.strip(),
        "temperature": 0,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_schema", "json_schema": {"name": name, "schema": schema, "strict": True}},
    }).encode()
    request = Request(
        f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {settings.openrouter_api_key.strip()}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=max(1, settings.subscription_llm_timeout_seconds)) as response:
            payload = json.loads(response.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
        return json.loads(content) if isinstance(content, str) else None
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, IndexError, TypeError) as error:
        logger.warning("[subscription-llm] request_failed name=%s error_type=%s", name, type(error).__name__)
        return None


def _resolve_merchants(strings: list[str]) -> dict[str, tuple[str, str]]:
    safe = [value for value in strings if value and not _UNSAFE.search(value)][:_MAX_STRINGS]
    resolved: dict[str, tuple[str, str]] = {}
    missing: list[str] = []
    with _cache_lock:
        for value in safe:
            cached = _cache.get(_key("merchant", value))
            if cached is None:
                missing.append(value)
            elif cached["canonical_name"]:
                resolved[value] = (cached["canonical_name"], cached["display_name"])
    if not missing:
        return resolved
    prompt = (
        "Each string is a normalised bank-statement merchant descriptor from a South African "
        "statement. For each input, return the canonical subscription service it belongs to as "
        "a lowercase snake_case canonical_name (for example chatgpt, netflix, apple) and a short "
        "display_name. Return null for both when you are not confident, or when the string is "
        "not a subscription service. Return one entry per input, echoing the input exactly.\n"
        + json.dumps({"inputs": missing})
    )
    output = _request(prompt, _MERCHANT_SCHEMA, "merchant_labels")
    if not isinstance(output, dict) or not isinstance(output.get("merchants"), list):
        return resolved
    wanted = set(missing)
    with _cache_lock:
        for entry in output["merchants"]:
            if not isinstance(entry, dict) or entry.get("input") not in wanted:
                continue
            canonical, display = entry.get("canonical_name"), entry.get("display_name")
            valid = (
                isinstance(canonical, str) and _CANONICAL.match(canonical)
                and isinstance(display, str) and 0 < len(display.strip()) <= 40
            )
            record = {
                "canonical_name": canonical if valid else None,
                "display_name": display.strip() if valid else None,
                "model": settings.subscription_llm_model.strip(),
                "prompt_version": PROMPT_VERSION,
            }
            _cache[_key("merchant", entry["input"])] = record
            if valid:
                resolved[entry["input"]] = (canonical, record["display_name"])
    return resolved


class _MerchantResolver:
    def __init__(self) -> None:
        self.model = settings.subscription_llm_model.strip()
        self.prompt_version = PROMPT_VERSION

    def __call__(self, strings: list[str]) -> dict[str, tuple[str, str]]:
        return _resolve_merchants(strings)


def merchant_resolver() -> _MerchantResolver | None:
    """Return the LLM merchant resolver, or None while the feature is off."""
    return _MerchantResolver() if _enabled() else None


def _group_facts(group: SubscriptionGroup) -> dict[str, Any]:
    return {
        "service": group.canonical_name,
        "classification": group.classification,
        "cadence": group.cadence,
        "current_amount": str(group.current_amount) if group.current_amount is not None else None,
        "successful_payments": group.successful_payment_count,
        "failed_attempts": group.failed_payment_attempt_count,
        "late_payments": group.late_payment_count,
        "payment_dates": [item["date"] for item in group.price_history],
        "price_changes": [{"date": item["date"], "from": str(item["from"]), "to": str(item["to"])} for item in group.price_changes],
    }


def label_subscription_groups(groups: list[SubscriptionGroup]) -> list[SubscriptionGroup]:
    """Add a plain-language reason to each group. A no-op while the feature is off."""
    if not _enabled():
        return groups
    labelled: list[SubscriptionGroup] = []
    for group in groups:
        facts = json.dumps(_group_facts(group), sort_keys=True)
        key = _key("reason", facts)
        with _cache_lock:
            cached = _cache.get(key)
        if cached is None:
            prompt = (
                "In one sentence of at most 200 characters, explain in plain language why this "
                "group of bank charges looks like a subscription or variable spend. Use only the "
                "facts given; do not state amounts or dates that are not listed.\n" + facts
            )
            output = _request(prompt, _REASON_SCHEMA, "subscription_reason")
            reason = output.get("reason") if isinstance(output, dict) else None
            if not isinstance(reason, str) or not reason.strip():
                labelled.append(group)
                continue
            cached = {"reason": reason.strip()[:200]}
            with _cache_lock:
                _cache[key] = cached
        labelled.append(group.model_copy(update={
            "ai_reason": cached["reason"],
            "ai_model": settings.subscription_llm_model.strip(),
            "ai_prompt_version": PROMPT_VERSION,
        }))
    return labelled
