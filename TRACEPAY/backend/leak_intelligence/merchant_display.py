"""Safe merchant labels for leak titles and evidence (no statement boilerplate)."""

from __future__ import annotations

import re

from categorisation.normalize import normalize_for_matching

_BOILERPLATE_FRAGMENT = re.compile(
    r"\b(?:ACCOUNT|ACCT|AMOUNT|REFERENCE|REF|AUTHORIZATION|AUTH|TRN|TXN|"
    r"IMMEDIATE|PAYMENT|TRANSFER|DEBIT|CREDIT|PURCHASE|POS|CARD)\b",
    re.IGNORECASE,
)
_ACCOUNT_ID_PHRASE = re.compile(r"\bACCOUNT\s+ID\b", re.IGNORECASE)
_ZAR_AMOUNT_FRAGMENT = re.compile(r"\bZAR\s*\d", re.IGNORECASE)
_LONG_DIGIT_RUN = re.compile(r"\d{6,}")
_REDACTED = re.compile(r"\[(?:ACCOUNT_ID|PHONE|REDACTED)\]", re.IGNORECASE)


def is_reliable_merchant_display_name(value: str | None) -> bool:
    if not value or not value.strip():
        return False
    normalized = normalize_for_matching(value)
    if not normalized or normalized in {"-", "UNKNOWN"}:
        return False
    upper = normalized.upper()
    if _REDACTED.search(upper) or _ACCOUNT_ID_PHRASE.search(upper):
        return False
    if _ZAR_AMOUNT_FRAGMENT.search(upper):
        return False
    if _LONG_DIGIT_RUN.search(upper):
        return False
    tokens = upper.split()
    if not tokens:
        return False
    generic_only = frozenset({"ACCOUNT", "ID", "US", "FOR", "THE", "TO", "FROM", "YOUR", "MY"})
    if set(tokens).issubset(generic_only):
        return False
    if all(_BOILERPLATE_FRAGMENT.search(token) for token in tokens):
        return False
    if upper.startswith("ACCOUNT ID"):
        return False
    return True


def display_merchant_label(value: str) -> str:
    """Readable short label when the merchant key is reliable."""
    normalized = normalize_for_matching(value)
    tokens = normalized.split()[:4]
    parts: list[str] = []
    for token in tokens:
        if token.isalpha() and len(token) > 1:
            parts.append(token.title())
        elif token.isalpha():
            parts.append(token.upper())
        else:
            parts.append(token)
    return " ".join(parts).strip()


def recurring_leak_title(*, subscription: bool, merchant_name: str | None) -> str:
    if merchant_name and is_reliable_merchant_display_name(merchant_name):
        label = display_merchant_label(merchant_name)
        if subscription:
            return f"Potential subscription payment at {label}"
        return f"Potential recurring payment at {label}"
    if subscription:
        return "Potential subscription payment"
    return "Potential recurring payment"
