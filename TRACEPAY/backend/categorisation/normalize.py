"""Description and merchant normalization for categorisation."""

from __future__ import annotations

import re

from categorisation.sanitizer import sanitize_for_ai

# Classification matching still needs many of these phrases intact.
# Merchant extraction uses `_EXTRACTION_PREFIXES` after matching normalization.
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

# Longest / most specific first. Applied only when deriving a merchant label.
_EXTRACTION_PREFIXES = (
    re.compile(
        r"^(?:PURCHASE\s+)?WITH\s+CARD\s+AT(?:\s+EPOS(?:\s+AT)?)?\s*",
        re.IGNORECASE,
    ),
    re.compile(r"^EPOS\s+AT\s+", re.IGNORECASE),
    re.compile(r"^ONLINE\s+PURCHASE\s*", re.IGNORECASE),
    re.compile(r"^RECURRING\s+CARD\s+PURCHASE:\s*", re.IGNORECASE),
    re.compile(
        r"^INTERNATIONAL\s+ONLINE\s+PURCHASE(?:\s+INSUFFICIENT\s+FUNDS\s+FEE)?:\s*",
        re.IGNORECASE,
    ),
    re.compile(r"^CARD\s+PURCHASE(?:\s+INSUFFICIENT\s+FUNDS\s+FEE)?:\s*", re.IGNORECASE),
    re.compile(r"^RECURRING\s+PAYMENT\s+FROM\s+", re.IGNORECASE),
    re.compile(r"^PAYMENT\s+RECEIVED:\s*", re.IGNORECASE),
    re.compile(r"^PAYSHAP\s+PAYMENT\s+RECEIVED:\s*", re.IGNORECASE),
    re.compile(r"^BANKING\s+APP\s+TRANSFER\s+RECEIVED\s+FROM\s+", re.IGNORECASE),
    re.compile(r"^TRANSFER\s+RECEIVED\s+FROM\s+", re.IGNORECASE),
    re.compile(r"^BANKING\s+APP\s+AIRTIME\s+ADVANCE(?:\s+(?:FEE|PAYMENT))?\s*", re.IGNORECASE),
    re.compile(r"^BANKING\s+APP\s+", re.IGNORECASE),
    re.compile(r"^MONEY\s+TRANSFERRED\s+IN\s+FOR\s+", re.IGNORECASE),
    re.compile(r"^MONEY\s+TRANSFERRED\s+OUT\s+FROM\s+", re.IGNORECASE),
    re.compile(r"^MONEY\s+ADDED\s+TO\s+", re.IGNORECASE),
    re.compile(r"^SEND\s*MONEY\s+TO\s+", re.IGNORECASE),
    re.compile(r"^PAY\s+BENEFICIARY\s*,?\s*", re.IGNORECASE),
    re.compile(r"^PAYSHAP\s+(?:PAY\s+BY\s+SHAP(?:ID)?\s*)?", re.IGNORECASE),
    re.compile(r"^PAY\s+BY\s+SHAP(?:ID)?\s*", re.IGNORECASE),
    re.compile(r"^MOBILE\s+PURCHASE\s+(?:FOR\s+)?", re.IGNORECASE),
    re.compile(r"^DL\*", re.IGNORECASE),
)

# Labels that are bank wording alone — never a merchant.
_BOILERPLATE_LABELS = frozenset(
    {
        "WITH CARD AT",
        "PURCHASE WITH CARD AT",
        "EPOS AT",
        "ONLINE PURCHASE",
        "RECURRING PAYMENT FROM",
        "RECURRING PAYMENT",
        "MONEY TRANSFERRED IN FOR",
        "MONEY TRANSFERRED OUT FROM",
        "MONEY TRANSFERRED IN",
        "MONEY TRANSFERRED OUT",
        "MONEY ADDED TO",
        "PAYMENT FROM",
        "PAYMENT TO",
        "POS PURCHASE",
        "CARD PURCHASE",
        "IMMEDIATE PAYMENT",
        "PAYSHAP",
        "PAY SHAP",
        "PAY BY SHAP",
        "PAY BY SHAPID",
        "PAYSHAP PAY BY SHAPID",
        "PAY SHAP PAY BY SHAPID",
        "MOBILE PURCHASE",
        "MOBILE PURCHASE FOR PHONE",
        "PHONE",
        "UNKNOWN",
        "-",
    }
)

_BOILERPLATE_LABEL_PREFIXES = (
    "WITH CARD AT",
    "PURCHASE WITH CARD AT",
    "RECURRING PAYMENT FROM",
    "MONEY TRANSFERRED IN FOR",
    "MONEY TRANSFERRED OUT FROM",
    "MONEY TRANSFERRED IN",
    "MONEY TRANSFERRED OUT",
)

_NOISE_PATTERNS = (
    re.compile(r"\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b"),  # embedded dates
    re.compile(
        r"\b(?:REF|REFERENCE|CARD|ACCT|ACCOUNT|AUTH|TRN|TXN)[\s:#-]*[A-Z0-9-]{4,}\b",
        re.IGNORECASE,
    ),
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


def strip_bank_extraction_prefixes(value: str | None) -> str:
    """Remove bank-generated prefixes used only when naming a merchant/recipient."""
    text = normalize_for_matching(value)
    if not text:
        return ""
    changed = True
    while changed:
        changed = False
        for pattern in _EXTRACTION_PREFIXES:
            updated = pattern.sub("", text).strip(" -/")
            if updated != text:
                text = updated
                changed = True
    return text


def is_bank_boilerplate_label(value: str | None) -> bool:
    """True when the value is bank wording, not a merchant or recipient."""
    normalized = normalize_for_matching(value)
    if not normalized:
        return True
    upper = normalized.upper()
    if upper in _BOILERPLATE_LABELS:
        return True
    for prefix in _BOILERPLATE_LABEL_PREFIXES:
        if upper == prefix:
            return True
        if upper.startswith(prefix + " "):
            # Prefix plus a 1–2 character stub ("DI", "AT") is still bank wording.
            remainder = upper[len(prefix) :].strip()
            if not remainder or (len(remainder) <= 2 and remainder.isalpha()):
                return True
    # Exact template leftovers after extraction prefixes.
    remainder = strip_bank_extraction_prefixes(normalized)
    if not remainder:
        return True
    if remainder.upper() in _BOILERPLATE_LABELS:
        return True
    if upper.startswith("TRANSFER TO ") or upper.startswith("TRANSFER FROM "):
        return True
    if upper.startswith("EFT TO ") or upper.startswith("EFT FROM ") or upper.startswith("EFT FOR "):
        return True
    return False


def merchant_key(value: str | None) -> str:
    """Stable key for merchant memory lookups. Empty when only bank boilerplate.

    Prefer the extracted/catalogue remainder so card and transfer prefixes never
    become memory or grouping keys.
    """
    if is_bank_boilerplate_label(value):
        return ""
    extracted = extract_merchant_name(value)
    if extracted and not is_bank_boilerplate_label(extracted):
        text = normalize_for_matching(extracted)
        if text and text not in {"-", "UNKNOWN"}:
            return text
    text = normalize_for_matching(value)
    if not text or text in {"-", "UNKNOWN"}:
        return ""
    remainder = strip_bank_extraction_prefixes(text)
    if remainder and not is_bank_boilerplate_label(remainder):
        return remainder
    return text


def extract_merchant_name(description: str | None) -> str | None:
    """Best-effort merchant or recipient label derived from a bank description.

    Bank-generated prefixes are stripped. Recognised catalogue labels win.
    Empty or boilerplate remainders return None — never the bank wording itself.
    """
    cleaned = normalize_for_matching(description)
    if not cleaned or cleaned in {"-", "UNKNOWN"}:
        return None

    from categorisation.rules import recognised_merchant_label

    recognised = recognised_merchant_label(cleaned)
    if recognised:
        return recognised

    remainder = strip_bank_extraction_prefixes(cleaned)
    if not remainder:
        return None

    recognised_remainder = recognised_merchant_label(remainder)
    if recognised_remainder:
        return recognised_remainder

    if is_bank_boilerplate_label(remainder):
        return None

    label = _leading_merchant_label(remainder)
    if label is None:
        return None
    if is_bank_boilerplate_label(label):
        return None
    # Reject ultra-short stubs that are usually truncated bank text ("Di", "At").
    if len(label.replace(" ", "")) < 3:
        return None
    return label


def _leading_merchant_label(cleaned: str) -> str | None:
    tokens = cleaned.split(" ")
    kept: list[str] = []
    for index, token in enumerate(tokens):
        if not token or token.isdigit():
            break
        if len(token) == 1 and token not in {"&"}:
            # Keep SA-style initials when a longer alphabetic name token follows.
            following = tokens[index + 1 : index + 3]
            if any(len(item) > 1 and item.isalpha() for item in following):
                kept.append(token.upper())
                continue
            continue
        kept.append(token.title() if token.isalpha() else token)
        if len(kept) >= 4:
            break
    if not kept:
        return None
    name = " ".join(kept).strip(" -/")
    return name or None
