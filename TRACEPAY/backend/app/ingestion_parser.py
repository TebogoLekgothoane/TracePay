"""Deterministic parser for bank SMS and notification readings. Port of the former Node parser.

Writes parsed_transactions rows keyed to ingestion:<reading id>. No AI is involved.
"""

import re
from datetime import datetime, timezone
from typing import Any

# Amount after R / ZAR. Thousands may be separated by a comma, space or no-break space
# (R1,500.00 / R1 500,00 / R1 500). Decimals are exactly two digits after "." or ",".
AMOUNT = re.compile(
    r"(?:r|zar)\s?(\d{1,3}(?:[ , ]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)",
    re.IGNORECASE,
)
_AMOUNT_PARTS = re.compile(r"(?P<whole>\d{1,3}(?:[ , ]\d{3})+|\d+)(?:[.,](?P<cents>\d{2}))?")
DEBIT_WORDS = re.compile(
    r"\b(debit|debited|purchase|payment|paid|pos|card transaction|spent)\b", re.IGNORECASE
)
CREDIT_WORDS = re.compile(r"\b(credit|credited|deposit|received|refund|reversal)\b", re.IGNORECASE)
BANK_WORDS = re.compile(
    r"\b(bank|card|account|payment|purchase|debit|credit|pos|eft|absa|capitec|fnb|nedbank|"
    r"standard bank|tymebank|discovery bank)\b",
    re.IGNORECASE,
)
STOP_MERCHANTS = {"payment", "purchase", "transaction", "account", "card", "bank"}
MERCHANT_PATTERNS = [
    re.compile(r"\bat\s+([a-z0-9 &.'-]{2,80})", re.IGNORECASE),
    re.compile(r"\bfrom\s+([a-z0-9 &.'-]{2,80})", re.IGNORECASE),
    re.compile(r"\bto\s+([a-z0-9 &.'-]{2,80})", re.IGNORECASE),
]


def amount_from_text(raw: str) -> float | None:
    """Convert a matched amount such as '1,500.00', '1 500,00' or '250,00' to a float."""
    match = _AMOUNT_PARTS.fullmatch(raw.strip())
    if not match:
        return None
    whole = re.sub(r"[ , ]", "", match.group("whole"))
    cents = match.group("cents") or "00"
    amount = float(f"{whole}.{cents}")
    return amount if amount > 0 else None


def _parse_amount(body: str) -> float | None:
    match = AMOUNT.search(body)
    if not match:
        return None
    return amount_from_text(match.group(1))


def _parse_type(body: str) -> str:
    if CREDIT_WORDS.search(body):
        return "reversal" if "reversal" in body.lower() else "credit"
    if DEBIT_WORDS.search(body):
        return "debit"
    return "unknown"


def _normalize_merchant(value: str | None) -> str | None:
    if not value:
        return None
    merchant = re.sub(r"[^a-z0-9 &.'-]", " ", value, flags=re.IGNORECASE)
    merchant = re.sub(r"\s+", " ", merchant).strip()
    if len(merchant) < 2 or merchant.lower() in STOP_MERCHANTS:
        return None
    return merchant[:80]


def _parse_merchant(body: str) -> str | None:
    for pattern in MERCHANT_PATTERNS:
        match = pattern.search(body)
        merchant = _normalize_merchant(match.group(1) if match else None)
        if merchant:
            return merchant
    return None


def _merchant_key(merchant: str | None) -> str | None:
    if not merchant:
        return None
    key = re.sub(r"[^a-z0-9]+", "-", merchant.lower()).strip("-")
    return key or None


def _bank_name(reading: dict[str, Any]) -> str:
    return str(reading.get("sender") or reading.get("app_identifier") or "unknown")[:64]


def to_parsed_transaction(reading: dict[str, Any], now_iso: str) -> dict[str, Any] | None:
    title = reading.get("title") or ""
    text = f"{title} {reading.get('body') or ''}".strip()
    haystack = f"{reading.get('sender') or ''} {reading.get('app_identifier') or ''} {text}"
    if not BANK_WORDS.search(haystack):
        return None

    amount = _parse_amount(text)
    if not amount:
        return None

    kind = _parse_type(text)
    merchant = _parse_merchant(text)
    return {
        "user_id": reading["user_id"],
        "client_id": reading["client_id"],
        "bank": _bank_name(reading),
        "type": kind,
        "amount": amount,
        "currency": "ZAR",
        "merchant": merchant,
        "summary": text[:240],
        "category": "other",
        "occurred_at": reading["received_at"],
        "parsed_at": now_iso,
        "confidence": "high" if merchant and kind != "unknown" else "medium",
        "metadata": {"ingestionReadingId": reading["id"]},
        "source": "sms_parse" if reading.get("source") == "sms" else "notification_parse",
        "transaction_id": f"ingestion:{reading['id']}",
        "merchant_key": _merchant_key(merchant),
        "normalisation_version": 1,
        "normalised_at": now_iso,
    }


def build_parsed_rows(readings: list[dict[str, Any]], user_id: str) -> list[dict[str, Any]]:
    now_iso = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    rows: list[dict[str, Any]] = []
    for reading in readings:
        row = to_parsed_transaction({**reading, "user_id": user_id}, now_iso)
        if row is not None:
            rows.append(row)
    return rows
