"""Layered transaction source identification (deterministic first, AI validated)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from categorisation.normalize import (
    extract_merchant_name,
    is_bank_boilerplate_label,
    merchant_key,
    normalize_for_matching,
    strip_bank_extraction_prefixes,
)
from categorisation.rules import recognised_merchant_label
from categorisation.sanitizer import sanitize_for_ai

SourceType = Literal[
    "merchant",
    "person",
    "bank",
    "payment_processor",
    "payment_mechanism",
    "unknown",
]
Uncertainty = Literal["identified", "uncertain", "unknown"]

_PAYMENT_PROCESSORS = frozenset(
    {
        "PAYFAST",
        "PAYGATE",
        "PAYU",
        "PAYPAL",
        "PEACH PAYMENTS",
        "OZOW",
        "SNAPSCAN",
        "ZAPPER",
        "GOOGLE PAY",
        "APPLE PAY",
        "SAMSUNG PAY",
    }
)
_PAYMENT_MECHANISMS = frozenset(
    {
        "PAYSHAP",
        "PAY SHAP",
        "RTC",
        "EFT",
        "IMMEDIATE PAYMENT",
        "DEBIT ORDER",
        "STOP ORDER",
        "CARD PURCHASE",
        "POS PURCHASE",
        "CASH SEND",
        "SENDMONEY",
        "SEND MONEY",
    }
)
_BANK_TOKENS = frozenset(
    {
        "FNB",
        "ABSA",
        "NEDBANK",
        "STANDARD BANK",
        "CAPITEC",
        "TYMEBANK",
        "TYME BANK",
        "DISCOVERY BANK",
        "INVESTEC",
        "BANK ZERO",
        "AFRICAN BANK",
    }
)
_PERSON_MARKERS = (
    "SENDMONEY",
    "SEND MONEY",
    "PAY BENEFICIARY",
    "PAYSHAP",
    "PAY SHAP",
    "CASH SENT",
    "CAPITEC PAY",
    "MONEY TRANSFERRED",
)
_INTERNAL_TRANSFER_TOKENS = (
    "GOALSAVE",
    "GOAL SAVE",
    "LIVE BETTER",
    "ROUND-UP TRANSFER",
    "ROUND UP TRANSFER",
    "INTEREST SWEEP",
    "FIXED DEPOSIT",
)
_MECHANISM_ONLY_LABELS = frozenset(
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
        "CARD PURCHASE",
        "POS PURCHASE",
        "IMMEDIATE PAYMENT",
        "DEBIT ORDER",
        "RTC",
        "EFT",
    }
)
_PERSON_NAME = re.compile(r"^[A-Za-z](?:[A-Za-z'. -]){1,39}$")


@dataclass(frozen=True)
class SourceIdentity:
    source_type: SourceType
    merchant_name: str | None
    payment_mechanism: str | None
    transaction_type_hint: str | None
    supporting_text: str | None
    uncertainty: Uncertainty
    identification_method: str


def identify_source(description: str | None) -> SourceIdentity:
    """Deterministic source identity. Never invents a merchant from bank wording."""
    sanitised = sanitize_for_ai(description)
    matching = normalize_for_matching(description)
    if not matching:
        return _unknown("empty_description", sanitised)

    mechanism = _detect_mechanism(matching)
    if _is_processor_only(matching):
        return SourceIdentity(
            source_type="payment_processor",
            merchant_name=None,
            payment_mechanism=mechanism or matching.title(),
            transaction_type_hint=None,
            supporting_text=sanitised[:120] or None,
            uncertainty="identified",
            identification_method="deterministic:processor",
        )

    recognised = recognised_merchant_label(matching)
    if recognised:
        return SourceIdentity(
            source_type="merchant",
            merchant_name=recognised,
            payment_mechanism=mechanism,
            transaction_type_hint="spending",
            supporting_text=sanitised[:120] or None,
            uncertainty="identified",
            identification_method="deterministic:catalogue",
        )

    extracted = extract_merchant_name(description)
    remainder = strip_bank_extraction_prefixes(matching)
    stripped_template = remainder != matching
    if _is_mechanism_only_label(extracted) or _is_mechanism_only_label(remainder):
        return SourceIdentity(
            source_type="payment_mechanism",
            merchant_name=None,
            payment_mechanism=mechanism or (extracted or remainder or matching).title(),
            transaction_type_hint=None,
            supporting_text=sanitised[:120] or None,
            uncertainty="unknown",
            identification_method="deterministic:mechanism_label",
        )
    if extracted and not is_bank_boilerplate_label(extracted):
        if _looks_like_internal_transfer(matching):
            return SourceIdentity(
                source_type="bank",
                merchant_name=None,
                payment_mechanism=mechanism or "Transfer",
                transaction_type_hint="internal_transfer",
                supporting_text=extracted,
                uncertainty="identified",
                identification_method="deterministic:internal_transfer",
            )
        if _looks_like_person(matching, extracted):
            return SourceIdentity(
                source_type="person",
                merchant_name=None,
                payment_mechanism=mechanism,
                transaction_type_hint="person_to_person",
                supporting_text=extracted,
                uncertainty="identified",
                identification_method="deterministic:person",
            )
        if _looks_like_bank(extracted):
            return SourceIdentity(
                source_type="bank",
                merchant_name=None,
                payment_mechanism=mechanism,
                transaction_type_hint="bank_fee",
                supporting_text=extracted,
                uncertainty="identified",
                identification_method="deterministic:bank",
            )
        # Catalogue misses: keep a label only after a bank template was stripped,
        # otherwise leave merchant unknown instead of trusting free text.
        if stripped_template:
            return SourceIdentity(
                source_type="merchant",
                merchant_name=extracted,
                payment_mechanism=mechanism,
                transaction_type_hint=None,
                supporting_text=sanitised[:120] or None,
                uncertainty="identified",
                identification_method="deterministic:extract",
            )
        return SourceIdentity(
            source_type="unknown",
            merchant_name=None,
            payment_mechanism=mechanism,
            transaction_type_hint=None,
            supporting_text=extracted,
            uncertainty="uncertain",
            identification_method="deterministic:unverified_label",
        )

    if mechanism and (
        is_bank_boilerplate_label(matching) or not remainder or _is_mechanism_only_label(matching)
    ):
        return SourceIdentity(
            source_type="payment_mechanism",
            merchant_name=None,
            payment_mechanism=mechanism,
            transaction_type_hint=None,
            supporting_text=sanitised[:120] or None,
            uncertainty="unknown",
            identification_method="deterministic:mechanism_only",
        )

    return _unknown("unidentified", sanitised)


def validate_ai_source(
    *,
    description: str | None,
    proposed_merchant: str | None,
    source_type: str | None = None,
    payment_mechanism: str | None = None,
    uncertainty: str | None = None,
    supporting_text: str | None = None,
) -> SourceIdentity:
    """Accept AI source fields only when supported by the sanitised description."""
    baseline = identify_source(description)
    sanitised = sanitize_for_ai(description)
    matching = normalize_for_matching(description)
    proposed = (proposed_merchant or "").strip() or None

    if proposed and is_bank_boilerplate_label(proposed):
        proposed = None

    if proposed and not _supported_by_description(proposed, matching, sanitised):
        # Invented names are rejected even at high model confidence.
        return baseline if baseline.merchant_name else _unknown(
            "ai_rejected_unsupported",
            sanitised,
            mechanism=payment_mechanism or baseline.payment_mechanism,
        )

    typed = _coerce_source_type(source_type) or baseline.source_type
    if typed == "merchant" and not proposed:
        typed = "unknown"
    if typed in {"person", "bank", "payment_processor", "payment_mechanism"}:
        proposed = None

    status = _coerce_uncertainty(uncertainty)
    if proposed:
        status = "identified"
    elif status == "identified" and typed == "unknown":
        status = "unknown"

    if proposed or typed != "unknown":
        return SourceIdentity(
            source_type=typed if proposed or typed != "merchant" else "unknown",
            merchant_name=proposed,
            payment_mechanism=(
                payment_mechanism or baseline.payment_mechanism
            ),
            transaction_type_hint=baseline.transaction_type_hint,
            supporting_text=(supporting_text or baseline.supporting_text or sanitised[:120] or None),
            uncertainty=status if proposed or typed != "unknown" else "unknown",
            identification_method="ai:validated",
        )
    return baseline


def trusted_merchant_for_memory(identity: SourceIdentity) -> str | None:
    """Only verified merchant identities may enter merchant memory keys."""
    if identity.source_type != "merchant":
        return None
    if identity.uncertainty != "identified":
        return None
    if not identity.merchant_name or is_bank_boilerplate_label(identity.merchant_name):
        return None
    if not merchant_key(identity.merchant_name):
        return None
    return identity.merchant_name


def _unknown(
    method: str,
    sanitised: str,
    *,
    mechanism: str | None = None,
) -> SourceIdentity:
    return SourceIdentity(
        source_type="unknown",
        merchant_name=None,
        payment_mechanism=mechanism,
        transaction_type_hint=None,
        supporting_text=sanitised[:120] or None,
        uncertainty="unknown",
        identification_method=f"deterministic:{method}",
    )


def _detect_mechanism(matching: str) -> str | None:
    upper = matching.upper()
    for item in sorted(_PAYMENT_MECHANISMS, key=len, reverse=True):
        if item in upper:
            return item.title().replace("Payshap", "PayShap")
    if "WITH CARD AT" in upper or "CARD PURCHASE" in upper:
        return "Card purchase"
    if "RECURRING PAYMENT" in upper or "DEBIT ORDER" in upper:
        return "Debit order"
    if "MONEY TRANSFERRED" in upper:
        return "Transfer"
    if "MOBILE PURCHASE" in upper:
        return "Mobile purchase"
    if "PAY BY SHAP" in upper or "SHAPID" in upper:
        return "PayShap"
    return None


def _is_processor_only(matching: str) -> bool:
    remainder = strip_bank_extraction_prefixes(matching).upper()
    if not remainder:
        return False
    return remainder in _PAYMENT_PROCESSORS or any(
        remainder == item or remainder.startswith(item + " ")
        for item in _PAYMENT_PROCESSORS
    )


def _looks_like_person(matching: str, extracted: str) -> bool:
    upper = matching.upper()
    if _looks_like_internal_transfer(matching):
        return False
    if any(marker in upper for marker in _PERSON_MARKERS):
        # Mechanism-only PayShap rows are not people.
        if _is_mechanism_only_label(extracted):
            return False
        return recognised_merchant_label(extracted) is None
    if "MONEY TRANSFERRED" in upper and _PERSON_NAME.fullmatch(extracted):
        # Transfers named only as a person, not a known business token.
        return recognised_merchant_label(extracted) is None
    return False


def _looks_like_internal_transfer(matching: str) -> bool:
    upper = matching.upper()
    return any(token in upper for token in _INTERNAL_TRANSFER_TOKENS)


def _is_mechanism_only_label(value: str | None) -> bool:
    if not value:
        return False
    upper = normalize_for_matching(value).upper()
    return upper in _MECHANISM_ONLY_LABELS


def _looks_like_bank(extracted: str) -> bool:
    upper = extracted.upper()
    return upper in _BANK_TOKENS or any(upper.startswith(item) for item in _BANK_TOKENS)


def _supported_by_description(
    proposed: str,
    matching: str,
    sanitised: str,
) -> bool:
    if recognised_merchant_label(matching) and recognised_merchant_label(matching) == proposed:
        return True
    proposed_key = merchant_key(proposed)
    if not proposed_key:
        return False
    haystacks = (
        matching.upper(),
        normalize_for_matching(sanitised).upper(),
        strip_bank_extraction_prefixes(matching).upper(),
    )
    needle = proposed_key.upper()
    if any(needle in haystack for haystack in haystacks if haystack):
        return True
    # Allow catalogue alias when any alias token appears in the description.
    tokens = [token for token in needle.split() if len(token) >= 3]
    if tokens and all(any(token in haystack for haystack in haystacks) for token in tokens):
        return True
    return False


def _coerce_source_type(value: str | None) -> SourceType | None:
    if value in {
        "merchant",
        "person",
        "bank",
        "payment_processor",
        "payment_mechanism",
        "unknown",
    }:
        return value  # type: ignore[return-value]
    return None


def _coerce_uncertainty(value: str | None) -> Uncertainty:
    if value in {"identified", "uncertain", "unknown"}:
        return value  # type: ignore[return-value]
    return "uncertain"
