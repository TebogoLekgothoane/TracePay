"""Safe merchant labels for leak titles and evidence (no statement boilerplate)."""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal

from categorisation.normalize import is_bank_boilerplate_label, normalize_for_matching

_BOILERPLATE_FRAGMENT = re.compile(
    r"\b(?:ACCOUNT|ACCT|AMOUNT|REFERENCE|REF|AUTHORIZATION|AUTH|TRN|TXN|"
    r"IMMEDIATE|PAYMENT|TRANSFER|DEBIT|CREDIT|PURCHASE|POS|CARD)\b",
    re.IGNORECASE,
)
_ACCOUNT_ID_PHRASE = re.compile(r"\bACCOUNT\s+ID\b", re.IGNORECASE)
_ZAR_AMOUNT_FRAGMENT = re.compile(r"\bZAR\s*\d", re.IGNORECASE)
_LONG_DIGIT_RUN = re.compile(r"\d{6,}")
_REDACTED = re.compile(r"\[(?:ACCOUNT_ID|PHONE|REDACTED)\]", re.IGNORECASE)
# normalize_for_matching already strips a leading "PURCHASE".
_CARD_PURCHASE_BOILERPLATE = re.compile(
    r"WITH\s+CARD\s+AT(?:\s+EPOS(?:\s+AT)?)?\Z",
    re.IGNORECASE,
)
_TRANSFER_OR_RECURRING = re.compile(
    r"^(?:RECURRING\s+PAYMENT(?:\s+FROM)?|MONEY\s+TRANSFERRED(?:\s+(?:IN|OUT))?(?:\s+(?:FOR|FROM))?)"
    r"(?:\s+\w{1,2})?\Z",
    re.IGNORECASE,
)


def is_card_purchase_boilerplate(value: str | None) -> bool:
    """True when the label is only a card-purchase prefix, not a merchant."""
    if is_bank_boilerplate_label(value):
        normalized = normalize_for_matching(value)
        if not normalized:
            return True
        return (
            _CARD_PURCHASE_BOILERPLATE.fullmatch(normalized) is not None
            or normalized.upper().startswith("WITH CARD AT")
            or normalized.upper().startswith("PURCHASE WITH CARD AT")
        )
    normalized = normalize_for_matching(value)
    if not normalized:
        return False
    return _CARD_PURCHASE_BOILERPLATE.fullmatch(normalized) is not None


def is_reliable_merchant_display_name(value: str | None) -> bool:
    if not value or not value.strip():
        return False
    if is_bank_boilerplate_label(value):
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
    if _TRANSFER_OR_RECURRING.fullmatch(upper):
        return False
    if upper.startswith("MONEY TRANSFERRED") or upper.startswith("RECURRING PAYMENT"):
        return False
    mechanism_only = frozenset(
        {
            "PAYSHAP",
            "PAY SHAP",
            "PAY BY SHAP",
            "PAY BY SHAPID",
            "PAYSHAP PAY BY SHAPID",
            "SHAPID",
            "MOBILE PURCHASE",
            "MOBILE PURCHASE FOR PHONE",
            "PHONE",
            "RTC",
            "EFT",
            "IMMEDIATE PAYMENT",
            "DEBIT ORDER",
            "CARD PURCHASE",
            "POS PURCHASE",
        }
    )
    if upper in mechanism_only:
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


def merchant_display_name_for(merchant_key: str | None) -> str | None:
    """Safe label for an already reliable merchant key.

    Card-purchase boilerplate never becomes a display name. Detection keys,
    confidence, and amounts are unchanged.
    """
    if not merchant_key or not merchant_key.strip():
        return None
    if is_card_purchase_boilerplate(merchant_key):
        return None
    if not is_reliable_merchant_display_name(merchant_key):
        return None
    label = display_merchant_label(merchant_key)
    if not label or is_card_purchase_boilerplate(label):
        return None
    if not is_reliable_merchant_display_name(label):
        return None
    return label


def format_zar(amount: Decimal | None) -> str | None:
    """Compact ZAR label for titles when an amount is supported."""
    if amount is None or not isinstance(amount, Decimal) or not amount.is_finite():
        return None
    if amount < 0:
        return None
    quantized = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if quantized == quantized.to_integral_value():
        return f"R{int(quantized)}"
    return f"R{format(quantized, 'f')}"


def recurring_leak_title(
    *,
    subscription: bool,
    merchant_name: str | None,
    average_amount: Decimal | None = None,
) -> str:
    amount = format_zar(average_amount)
    label = merchant_display_name_for(merchant_name)
    if label:
        if subscription:
            if amount:
                return f"{label} subscription — {amount} recurring monthly payment"
            return f"Potential subscription payment at {label}"
        if amount:
            return f"{label} — {amount} recurring payment"
        return f"Potential recurring payment at {label}"
    if subscription:
        return "Unidentified subscription payment"
    return "Unidentified recurring payment"


def repeated_payments_title(
    *,
    merchant_name: str | None,
    average_amount: Decimal | None = None,
) -> str:
    """Title when cadence exists but evidence is too weak to assert a bill."""
    amount = format_zar(average_amount)
    label = merchant_display_name_for(merchant_name)
    if label:
        if amount:
            return f"Repeated payments detected at {label} — {amount} average"
        return f"Repeated payments detected at {label}"
    if amount:
        return f"Repeated payments detected — {amount} average"
    return "Repeated payments detected"


def debit_order_leak_title(*, merchant_name: str | None) -> str:
    label = merchant_display_name_for(merchant_name)
    if label:
        return f"Potential debit order at {label} that may warrant review"
    return "Potential debit order that may warrant review"


def duplicate_leak_title(
    *,
    merchant_name: str | None,
    amount: Decimal | None = None,
) -> str:
    money = format_zar(amount)
    label = merchant_display_name_for(merchant_name)
    if label:
        if money:
            return f"Possible duplicate payment at {label} — {money}"
        return f"Possible duplicate payment at {label} requires verification"
    if money:
        return f"Possible duplicate payment — {money} requires verification"
    return "Potential duplicate payment requires verification"


def spending_increase_title(
    *,
    source: str | None,
    change_amount: Decimal | None = None,
    source_is_merchant: bool = False,
) -> str:
    """Title for a spending increase when a merchant or category is known."""
    money = format_zar(change_amount)
    if source and source.strip():
        label = merchant_display_name_for(source) if source_is_merchant else source.strip()
        if label:
            if money:
                return (
                    f"{label} spending increased by {money} "
                    "compared with the previous period"
                )
            return f"{label} spending increased"
    if money:
        return f"Spending increased by {money} compared with the previous period"
    return "Potential spending escalation"
