"""Optional Anthropic analysis for bank-transaction leaks and subscriptions.

This module is intentionally isolated from the deterministic feature pipeline.
Callers can opt into it explicitly while the existing rules remain available as
the auditable fallback. No API key or raw provider response is written to logs.
"""

from __future__ import annotations

import json
import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings
from categorisation.sanitizer import sanitize_for_ai

from .models import FeatureTransaction

logger = logging.getLogger("tracepay.leak_intelligence.anthropic")


class AnthropicAnalysisError(RuntimeError):
    """Raised when an opted-in Anthropic analysis cannot be completed safely."""


def anthropic_analysis_available() -> bool:
    """Return whether an Anthropic key is configured without exposing it."""
    return bool(settings.anthropic_api_key.strip())


def analyze_transactions_with_anthropic(
    transactions: list[FeatureTransaction],
    *,
    max_transactions: int = 10_000,
) -> dict[str, Any]:
    """Ask Anthropic to identify possible leaks and subscriptions.

    The input is reduced to transaction facts needed for analysis. User IDs,
    statement IDs, account numbers, and other internal fields are never sent.
    The returned object is validated into a stable, bounded shape before it is
    handed to application code.
    """
    if not anthropic_analysis_available():
        raise AnthropicAnalysisError("Anthropic analysis is not configured.")
    rows = _transaction_payload(transactions[:max(0, max_transactions)])
    if not rows:
        return {"leaks": [], "subscriptions": [], "notes": []}
    try:
        raw = _request_anthropic(rows)
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
        logger.warning("anthropic_financial_analysis_failed error_type=%s", type(error).__name__)
        raise AnthropicAnalysisError("Anthropic financial analysis failed.") from error
    return _complete_amounts_and_evidence(_validate_result(raw), rows)


def _complete_amounts_and_evidence(result: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {row["transaction_id"]: row for row in rows}
    for collection, ids_key, monthly_key, annual_key in (
        (result["leaks"], "transaction_ids", "monthly_impact", "annual_impact"),
        (result["subscriptions"], "successful_transaction_ids", "estimated_monthly_cost", "estimated_annual_cost"),
    ):
        for item in collection:
            evidence = item["evidence_transactions"]
            if not evidence:
                evidence = [
                    {"transaction_id": row["transaction_id"], "date": row["date"], "amount": row["amount"], "description": row["description"]}
                    for identifier in item[ids_key]
                    if (row := by_id.get(identifier)) is not None
                ]
                item["evidence_transactions"] = evidence
            if item["observed_amount"] is None:
                amounts = [Decimal(row["amount"]) for row in evidence if row.get("amount") is not None]
                if amounts:
                    item["observed_amount"] = str(sum((abs(amount) for amount in amounts), Decimal("0")).quantize(Decimal("0.01")))
            if item[annual_key] is None and item[monthly_key] is not None:
                item[annual_key] = str((Decimal(item[monthly_key]) * Decimal("12")).quantize(Decimal("0.01")))
    return result


def _transaction_payload(transactions: list[FeatureTransaction]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    ordered = sorted(
        (item for item in transactions if not item.is_duplicate),
        key=lambda item: (item.transaction_date or date.min, item.transaction_id),
    )
    for item in ordered:
        rows.append(
            {
                "transaction_id": item.transaction_id,
                "date": item.transaction_date.isoformat() if item.transaction_date else None,
                "amount": str(item.amount),
                "transaction_type": item.transaction_type,
                "description": sanitize_for_ai(item.description or "")[:240],
                "merchant_name": sanitize_for_ai(item.merchant_name or "")[:120] or None,
                "category": item.categorisation.category_name,
                "transaction_class": item.categorisation.transaction_class,
            }
        )
    return rows


def _request_anthropic(rows: list[dict[str, Any]]) -> dict[str, Any]:
    model = settings.anthropic_model.strip() or "claude-sonnet-4-6"
    url = f"{settings.anthropic_base_url.rstrip('/')}/v1/messages"
    body = {
        "model": model,
        "max_tokens": 4_096,
        "system": _SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": json.dumps({"transactions": rows}, separators=(",", ":"))}],
        "tools": [{"name": "analyze_finances", "description": "Return structured possible leaks and subscriptions from the supplied transactions.", "input_schema": _OUTPUT_SCHEMA}],
        "tool_choice": {"type": "tool", "name": "analyze_finances"},
    }
    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "x-api-key": settings.anthropic_api_key.strip(),
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=max(1, settings.anthropic_timeout_seconds)) as response:
        payload = json.loads(response.read().decode("utf-8"))
    for block in payload.get("content", []):
        if isinstance(block, dict) and block.get("type") == "tool_use" and isinstance(block.get("input"), dict):
            return block["input"]
    raise ValueError("Anthropic response did not include structured analysis.")


def _validate_result(value: dict[str, Any]) -> dict[str, Any]:
    leaks: list[dict[str, Any]] = []
    for item in value.get("leaks", []):
        if not isinstance(item, dict):
            continue
        title = _text(item.get("title"), 120)
        if not title:
            continue
        leaks.append(
            {
                "type": _enum(item.get("type"), {"subscription", "fee", "duplicate", "spending", "unknown"}, "unknown"),
                "title": title,
                "merchant": _text(item.get("merchant"), 120),
                "reason": _text(item.get("reason"), 500),
                "confidence": _confidence(item.get("confidence")),
                "monthly_impact": _decimal_string(item.get("monthly_impact")),
                "annual_impact": _decimal_string(item.get("annual_impact")),
                "observed_amount": _decimal_string(item.get("observed_amount")),
                "transaction_ids": _ids(item.get("transaction_ids")),
                "evidence_transactions": _evidence_transactions(item.get("evidence_transactions")),
                "steps_to_stop": _steps(item.get("steps_to_stop")),
            }
        )
    subscriptions: list[dict[str, Any]] = []
    for item in value.get("subscriptions", []):
        if not isinstance(item, dict):
            continue
        merchant = _text(item.get("merchant"), 120)
        if not merchant:
            continue
        subscriptions.append(
            {
                "merchant": merchant,
                "product": _text(item.get("product"), 120),
                "classification": _enum(item.get("classification"), {"fixed", "variable", "uncertain"}, "uncertain"),
                "cadence": _enum(item.get("cadence"), {"weekly", "fortnightly", "monthly", "quarterly", "annual", "irregular", "uncertain"}, "uncertain"),
                "current_amount": _decimal_string(item.get("current_amount")),
                "estimated_monthly_cost": _decimal_string(item.get("estimated_monthly_cost")),
                "estimated_annual_cost": _decimal_string(item.get("estimated_annual_cost")),
                "observed_amount": _decimal_string(item.get("observed_amount")),
                "confidence": _confidence(item.get("confidence")),
                "successful_transaction_ids": _ids(item.get("successful_transaction_ids")),
                "failed_transaction_ids": _ids(item.get("failed_transaction_ids")),
                "evidence_transactions": _evidence_transactions(item.get("evidence_transactions")),
                "steps_to_stop": _steps(item.get("steps_to_stop")),
                "reason": _text(item.get("reason"), 500),
            }
        )
    return {
        "leaks": sorted(leaks, key=lambda item: (item["type"], item["merchant"], item["title"])),
        "subscriptions": sorted(subscriptions, key=lambda item: (item["merchant"], item["product"], item["current_amount"] or "")),
        "notes": [_text(note, 300) for note in value.get("notes", []) if _text(note, 300)],
    }


def _text(value: Any, limit: int) -> str:
    return sanitize_for_ai(value)[:limit].strip() if isinstance(value, str) else ""


def _ids(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return sorted({_text(item, 120) for item in value if _text(item, 120)})


def _evidence_transactions(value: Any) -> list[dict[str, str | None]]:
    if not isinstance(value, list):
        return []
    rows: list[dict[str, str | None]] = []
    for item in value[:30]:
        if not isinstance(item, dict):
            continue
        transaction_id = _text(item.get("transaction_id"), 120)
        if not transaction_id:
            continue
        rows.append({
            "transaction_id": transaction_id,
            "date": _text(item.get("date"), 20) or None,
            "amount": _decimal_string(item.get("amount")),
            "description": _text(item.get("description"), 180),
        })
    return rows


def _steps(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_text(item, 240) for item in value[:6] if _text(item, 240)]


def _confidence(value: Any) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, result))


def _decimal_string(value: Any) -> str | None:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return str(number.quantize(Decimal("0.01"))) if number.is_finite() else None


def _enum(value: Any, allowed: set[str], fallback: str) -> str:
    return value if isinstance(value, str) and value in allowed else fallback


_SYSTEM_PROMPT = """You analyze bank transaction rows for TracePay.
Return only the analyze_finances tool input. Identify possible financial leaks
and recurring subscriptions, but do not invent merchants or certainty.

Rules:
- Failed payments, insufficient-funds charges, bank fees, reversals, refunds,
  transfers, and duplicate rows are evidence or exclusions, never successful
  subscription payments.
- Keep different products from the same merchant separate when amounts or
  descriptions support that distinction.
- Uber, Bolt, Uber Eats, food delivery, and ordinary ride/shopping purchases
  are not subscriptions merely because they repeat.
- Use the most recent successful payment as current_amount.
- estimated_monthly_cost must be based on observed successful payments and
  cadence, not failed fees.
- For every candidate, calculate observed_amount from the supplied evidence
  rows, and provide estimated monthly and annual cost when the cadence supports
  it. Do not call an estimate money already lost.
- Include evidence_transactions with the exact transaction ID, date, amount,
  and short description used for the conclusion.
- Include practical steps_to_stop. Do not claim cancellation is guaranteed;
  say what the person should review, cancel, downgrade, dispute, or change.
- Every claim must include supporting transaction IDs. Mark uncertain cases.
"""

_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "leaks": {"type": "array", "items": {"type": "object", "properties": {
            "type": {"type": "string", "enum": ["subscription", "fee", "duplicate", "spending", "unknown"]},
            "title": {"type": "string"}, "merchant": {"type": "string"}, "reason": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1}, "monthly_impact": {"type": ["string", "null"]},
            "annual_impact": {"type": ["string", "null"]}, "observed_amount": {"type": ["string", "null"]},
            "transaction_ids": {"type": "array", "items": {"type": "string"}},
            "evidence_transactions": {"type": "array", "items": {"type": "object", "properties": {"transaction_id": {"type": "string"}, "date": {"type": ["string", "null"]}, "amount": {"type": ["string", "null"]}, "description": {"type": "string"}}, "required": ["transaction_id", "date", "amount", "description"], "additionalProperties": False}},
            "steps_to_stop": {"type": "array", "items": {"type": "string"}},
        }, "required": ["type", "title", "merchant", "reason", "confidence", "monthly_impact", "annual_impact", "observed_amount", "transaction_ids", "evidence_transactions", "steps_to_stop"], "additionalProperties": False}},
        "subscriptions": {"type": "array", "items": {"type": "object", "properties": {
            "merchant": {"type": "string"}, "product": {"type": "string"},
            "classification": {"type": "string", "enum": ["fixed", "variable", "uncertain"]},
            "cadence": {"type": "string", "enum": ["weekly", "fortnightly", "monthly", "quarterly", "annual", "irregular", "uncertain"]},
            "current_amount": {"type": ["string", "null"]}, "estimated_monthly_cost": {"type": ["string", "null"]},
            "estimated_annual_cost": {"type": ["string", "null"]}, "observed_amount": {"type": ["string", "null"]},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "successful_transaction_ids": {"type": "array", "items": {"type": "string"}},
            "failed_transaction_ids": {"type": "array", "items": {"type": "string"}}, "evidence_transactions": {"type": "array", "items": {"type": "object", "properties": {"transaction_id": {"type": "string"}, "date": {"type": ["string", "null"]}, "amount": {"type": ["string", "null"]}, "description": {"type": "string"}}, "required": ["transaction_id", "date", "amount", "description"], "additionalProperties": False}}, "steps_to_stop": {"type": "array", "items": {"type": "string"}}, "reason": {"type": "string"},
        }, "required": ["merchant", "product", "classification", "cadence", "current_amount", "estimated_monthly_cost", "estimated_annual_cost", "observed_amount", "confidence", "successful_transaction_ids", "failed_transaction_ids", "evidence_transactions", "steps_to_stop", "reason"], "additionalProperties": False}},
        "notes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["leaks", "subscriptions", "notes"],
    "additionalProperties": False,
}
