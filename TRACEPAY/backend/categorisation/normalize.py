"""Description and merchant normalization for categorisation."""

from __future__ import annotations

import re

from categorisation.sanitizer import sanitize_for_ai

_PREFIX_PATTERNS = (
    re.compile(r"^POS\s+PURCHASE\s+", re.IGNORECASE),
    re.compile(r"^CARD\s+PURCHASE\s+", re.IGNORECASE),
    re.compile(r"^PURCHASE\s+AT\s+", re.IGNORECASE),
    re.compile(r"^PURCHASE\s+", re.IGNORECASE),
    re.compile(r"^PAYMENT\s+TO\s+", re.IGNORECASE),
    re.compile(r"^PAYMENT\s+FROM\s+", re.IGNORECASE),
    re.compile(r"^VAS\s*-\s*", re.IGNORECASE),
    re.compile(r"^EFT\s+(?:FROM|TO|FOR)\s+", re.IGNORECASE),
    re.compile(r"^RTC\s+", re.IGNORECASE),
    re.compile(r"^IMMEDIATE\s+PAYMENT\s+(?:FROM|TO)\s+", re.IGNORECASE),
)

_NOISE_PATTERNS = (
    re.compile(r"\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b"),  # embedded dates
    re.compile(r"\b(?:REF|REFERENCE|CARD|ACCT|ACCOUNT|AUTH|TRN|TXN)[\s:#-]*[A-Z0-9-]{4,}\b", re.IGNORECASE),
    re.compile(r"\b\d{6,}\b"),  # long numeric refs / account fragments
    re.compile(r"[*#]+"),
)

_PUNCT_RE = re.compile(r"[^\w\s&'/.-]+", re.UNICODE)
_SPACE_RE = re.compile(r"\s+")
_TLD_RE = re.compile(r"\.(?:COM|CO|ZA|NET|ORG|IO|APP)(?:\b|$)", re.IGNORECASE)


def normalize_description(value: str | None) -> str:
    """Normalize bank descriptions for deterministic matching without dropping merchant tokens."""
    text = (value or "").upper().replace("\r", " ").replace("\n", " ").strip()
    text = text.replace("’", "'")
    text = _SPACE_RE.sub(" ", text)
    return text


def normalize_for_matching(value: str | None) -> str:
    """Stronger normalization used for merchant keys and reusable matching."""
    text = sanitize_for_ai(value or "")
    text = normalize_description(text)
    for pattern in _PREFIX_PATTERNS:
        text = pattern.sub("", text)
    for pattern in _NOISE_PATTERNS:
        text = pattern.sub(" ", text)
    text = _TLD_RE.sub(" ", text)
    text = _PUNCT_RE.sub(" ", text)
    text = text.replace("_", " ")
    text = _SPACE_RE.sub(" ", text).strip(" -/")
    return text


def merchant_key(value: str | None) -> str:
    """Stable key for merchant memory lookups."""
    text = normalize_for_matching(value)
    if not text or text in {"-", "UNKNOWN"}:
        return ""
    return text


def extract_merchant_name(description: str | None) -> str | None:
    """Best-effort merchant label derived from a bank description."""
    cleaned = normalize_for_matching(description)
    if not cleaned or cleaned in {"-", "UNKNOWN"}:
        return None
    # Prefer the leading merchant phrase; keep it short and readable.
    tokens = cleaned.split(" ")
    kept: list[str] = []
    for token in tokens:
        if token.isdigit():
            break
        if len(token) == 1 and token not in {"&"}:
            continue
        kept.append(token.title() if token.isalpha() else token)
        if len(kept) >= 4:
            break
    if not kept:
        return None
    name = " ".join(kept).strip(" -/")
    return name or None
