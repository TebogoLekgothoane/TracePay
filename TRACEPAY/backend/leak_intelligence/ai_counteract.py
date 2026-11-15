"""AI-written plan for counteracting one finding.

The model only ever sees the already-sanitised guidance text for a finding (title,
what happened, evidence labels and values). It never sees raw statement lines,
account numbers or the user's other findings, and it cannot change anything. Results
are cached so a repeat view costs nothing, and callers must reserve budget first.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock

from app.ai_usage import record_ai_usage
from app.config import settings
from categorisation.ai_classifier import (
    _chat_response_text,
    _configured_model,
    _request_openai,
    _request_openrouter,
    _request_xai,
)
from categorisation.sanitizer import sanitize_for_ai

logger = logging.getLogger("tracepay.leak.counteract")

FEATURE = "leak_counteract"
CACHE_MAX_ENTRIES = 500
MAX_ACTIONS = 5

_cache: "OrderedDict[str, tuple[float, CounteractPlan]]" = OrderedDict()
_cache_lock = Lock()

_STEP = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {"title": {"type": "string"}, "detail": {"type": "string"}},
        "required": ["title", "detail"],
        "additionalProperties": False,
    },
}

_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "potential_saving": {"type": "string"},
        "actions": _STEP,
        "prevent": _STEP,
    },
    "required": ["summary", "potential_saving", "actions", "prevent"],
    "additionalProperties": False,
}

_INSTRUCTIONS = (
    "You help a South African bank customer deal with one flagged pattern found in their "
    "statements, and stop it costing them again. Give two lists.\n"
    f"actions: what to do now (up to {MAX_ACTIONS}): what to verify first, who to contact (the "
    "merchant, or their bank's app, call centre or branch), and how to cancel, dispute, "
    "downgrade or switch where relevant.\n"
    "prevent: how to stop it happening again and spend less (up to "
    f"{MAX_ACTIONS}): the specific setting, habit or cheaper alternative that removes the cost. "
    "Be concrete about what to switch off or change, for example: turn off SMS notifications "
    "in the banking app and use free push notifications instead; check balances in the app "
    "instead of at an ATM; use the app or online banking instead of branch or ATM transactions; "
    "pay by standard EFT instead of an immediate payment when it is not urgent; cancel a "
    "forgotten subscription and set a calendar reminder before free trials end; stop a debit "
    "order with the bank as well as the merchant; ask the bank to move you to a cheaper account "
    "if the fees keep repeating; set a weekly limit for habit spending. Use only the options "
    "that fit this finding.\n"
    "potential_saving: one sentence on what could be saved. Only use the monthly_cost_rand "
    "given, as an upper limit (for example up to R49 a month, about R588 a year); if it is 0 "
    "or unknown, leave this empty. Never invent amounts.\n"
    "summary: one or two sentences on the best way to deal with this.\n"
    "Use South African context and rand. Rules: use only the facts given and never invent "
    "amounts, dates, merchants, fees or phone numbers. Do not state that the charge is an "
    "error, fraud or a duplicate; say what to verify. Do not promise savings. TracePay cannot "
    "cancel, dispute or move money, so every step is something the customer does. Each step is "
    "a short imperative title plus one or two plain sentences. Most useful first.\n\n"
    "Finding: "
)


@dataclass(frozen=True)
class CounteractPlan:
    summary: str
    actions: tuple[tuple[str, str], ...]
    prevent: tuple[tuple[str, str], ...] = ()
    potential_saving: str = ""

    def payload(self, source: str = "ai") -> dict[str, object]:
        return {
            "source": source,
            "summary": self.summary,
            "potential_saving": self.potential_saving,
            "actions": [{"title": t, "detail": d} for t, d in self.actions],
            "prevent": [{"title": t, "detail": d} for t, d in self.prevent],
        }


def _clean(value: object, limit: int) -> str:
    return sanitize_for_ai(str(value or "")).strip()[:limit]


def finding_facts(guidance: dict[str, object]) -> dict[str, object]:
    """The only data sent to the model."""
    evidence = guidance.get("evidence")
    rows = []
    if isinstance(evidence, list):
        for item in evidence[:12]:
            if isinstance(item, dict):
                rows.append({"label": _clean(item.get("label"), 80), "value": _clean(item.get("value"), 80)})
    return {
        "title": _clean(guidance.get("title"), 160),
        "what_happened": _clean(guidance.get("what_happened"), 400),
        "details": rows,
    }


def leak_facts(leak: object) -> dict[str, object]:
    """The only data sent to the model for a live finding: its own cleaned summary.

    No transaction rows, no ids, no account details. The monthly figure and count are kept so
    the plan can be specific about what is at stake.
    """
    claims = getattr(leak, "claims", None)
    confirmed = [getattr(c, "text", "") for c in (getattr(claims, "confirmed", None) or [])][:4]
    try:
        monthly = round(float(getattr(leak, "estimated_monthly_impact", 0) or 0), 2)
    except (TypeError, ValueError):
        monthly = 0.0
    return {
        "title": _clean(getattr(leak, "title", ""), 160),
        "what_happened": _clean(getattr(leak, "description", ""), 400),
        "kind": _clean(getattr(leak, "leak_type", ""), 60),
        "monthly_cost_rand": monthly,
        "transactions": int(getattr(leak, "supporting_transaction_count", 0) or 0),
        "confirmed_facts": [_clean(text, 200) for text in confirmed if text],
    }


_FALLBACK = {
    "duplicate": (
        "Compare the charges",
        "Open both charges in your banking app and check whether one is pending, reversed or a genuine second purchase.",
        "Ask for a refund if it is a duplicate",
        "If one charge is wrong, contact the merchant first, then your bank's disputes team, with the dates and amounts.",
    ),
    "recurring": (
        "Decide if you still want it",
        "Check whether you still use this service and whether the amount is still right.",
        "Cancel or downgrade",
        "Cancel in the service's own app or website. For a debit order, also ask your bank to stop it so it cannot be collected again.",
    ),
    "fees": (
        "Look at the fee schedule",
        "Find which of your fees repeat the most in your bank's published pricing guide.",
        "Ask for a cheaper option",
        "Ask your bank about a lower-cost account or payment method, such as fewer SMS notifications or fewer ATM balance checks.",
    ),
    "spending": (
        "Review the purchases",
        "Look through the listed transactions and mark which were needed and which were habit.",
        "Set a simple limit",
        "Pick a weekly amount for this kind of spending and track it against your statement next month.",
    ),
}


def fallback_actions(leak_type: str) -> tuple[tuple[str, str], ...]:
    """Plain steps when AI is unavailable: by the family the finding belongs to."""
    from leak_intelligence.finding_guidance import _RECURRING, _SPENDING

    if "duplicate" in leak_type:
        key = "duplicate"
    elif leak_type in _RECURRING:
        key = "recurring"
    elif "fee" in leak_type:
        key = "fees"
    elif leak_type in _SPENDING:
        key = "spending"
    else:
        return (
            ("Check it against your statement", "Open the listed transactions and confirm they are correct and expected."),
            ("Contact the merchant or your bank", "If something looks wrong, ask the merchant or your bank to explain or reverse it."),
        )
    a, b, c, d = _FALLBACK[key]
    return ((a, b), (c, d))


_FALLBACK_PREVENT = {
    "duplicate": (
        ("Check before you pay twice", "Wait for a payment to show as done before trying again, and check pending items in your banking app first."),
        ("Turn on payment alerts", "Use free push notifications in your banking app so you see a double charge the same day."),
    ),
    "recurring": (
        ("Review subscriptions monthly", "Set a monthly reminder to scan your statement for charges you no longer use."),
        ("Watch free trials", "Put a calendar reminder a day before a trial ends so it does not turn into a paid plan."),
    ),
    "fees": (
        ("Switch off SMS notifications", "SMS banking alerts are often charged per message. Turn them off in your banking app and use free push notifications instead."),
        ("Use the app, not the ATM or branch", "Check balances and pay in the app. ATM balance checks, branch transactions and immediate payments usually cost more."),
        ("Ask for a cheaper account", "If fees keep repeating, ask your bank whether a lower-cost account suits how you bank."),
    ),
    "spending": (
        ("Set a weekly limit", "Decide a weekly amount for this kind of spending and check it against your statement each month."),
        ("Plan instead of impulse", "Buy in bulk or plan ahead where you can, and wait a day before non-essential purchases."),
    ),
}


def fallback_prevent(leak_type: str) -> tuple[tuple[str, str], ...]:
    """Plain prevention steps when AI is unavailable."""
    from leak_intelligence.finding_guidance import _RECURRING, _SPENDING

    if "duplicate" in leak_type:
        return _FALLBACK_PREVENT["duplicate"]
    if leak_type in _RECURRING:
        return _FALLBACK_PREVENT["recurring"]
    if "fee" in leak_type:
        return _FALLBACK_PREVENT["fees"]
    if leak_type in _SPENDING:
        return _FALLBACK_PREVENT["spending"]
    return (("Review your statement monthly", "A quick monthly look at your statement is the easiest way to catch this early."),)


def fallback_plan(leak_type: str) -> CounteractPlan:
    return CounteractPlan(
        summary="Here is what you can do about this and how to stop it happening again.",
        actions=fallback_actions(leak_type),
        prevent=fallback_prevent(leak_type),
    )


def cache_key(user_id: str, finding_id: str, facts: dict[str, object]) -> str:
    digest = hashlib.sha256(json.dumps(facts, sort_keys=True).encode()).hexdigest()[:24]
    return f"{user_id}:{finding_id}:{digest}"


def cached_plan(key: str) -> CounteractPlan | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit is None:
            return None
        _cache.move_to_end(key)
        return hit[1]


def invalidate_user_plans(user_id: str) -> None:
    """Drop a user's cached plans; called when a new statement is imported."""
    prefix = f"{user_id}:"
    with _cache_lock:
        for key in [k for k in _cache if k.startswith(prefix)]:
            del _cache[key]


def _store(key: str, plan: CounteractPlan) -> None:
    with _cache_lock:
        _cache[key] = (time.time(), plan)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)


def parse_plan(text: str) -> CounteractPlan | None:
    try:
        parsed = json.loads(text)
    except ValueError:
        return None
    if not isinstance(parsed, dict):
        return None
    summary = " ".join(str(parsed.get("summary") or "").split())[:400]
    raw_actions = parsed.get("actions")
    if not summary or not isinstance(raw_actions, list):
        return None
    actions = _steps(raw_actions)
    prevent = _steps(parsed.get("prevent"))
    if not actions and not prevent:
        return None
    saving = " ".join(str(parsed.get("potential_saving") or "").split())[:200]
    return CounteractPlan(
        summary=summary, actions=actions, prevent=prevent, potential_saving=saving
    )


def _steps(raw: object) -> tuple[tuple[str, str], ...]:
    steps: list[tuple[str, str]] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        title = " ".join(str(item.get("title") or "").split())[:120]
        detail = " ".join(str(item.get("detail") or "").split())[:400]
        if title and detail:
            steps.append((title, detail))
        if len(steps) == MAX_ACTIONS:
            break
    return tuple(steps)


def ai_configured() -> bool:
    return any(settings.categorisation_provider_keys())


def generate_plan(key: str, facts: dict[str, object]) -> CounteractPlan | None:
    """Call the configured provider(s). Returns None when no usable plan comes back."""
    openrouter_loaded, openai_loaded, xai_loaded = settings.categorisation_provider_keys()
    providers = []
    if openrouter_loaded:
        providers.append(("openrouter", _request_openrouter))
    if openai_loaded:
        providers.append(("openai", _request_openai))
    if xai_loaded:
        providers.append(("xai", _request_xai))
    instructions = _INSTRUCTIONS + json.dumps(facts)
    for name, requester in providers:
        started = time.perf_counter()
        output = None
        try:
            output = requester(instructions, _SCHEMA, 1)
            plan = parse_plan(_chat_response_text(output, name)) if output else None
        except Exception as error:  # noqa: BLE001 - guidance must never fail on AI
            logger.warning("counteract_failed provider=%s error_type=%s", name, type(error).__name__)
            plan = None
        record_ai_usage(
            feature=FEATURE,
            provider=name,
            model=_configured_model(name),
            outcome="success" if plan else "failed",
            items=1,
            payload=output,
            duration_ms=(time.perf_counter() - started) * 1000,
        )
        if plan:
            _store(key, plan)
            return plan
    return None
