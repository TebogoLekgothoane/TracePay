"""Shared, side-effect-free helpers for financial feature calculation."""

from __future__ import annotations

from decimal import Decimal

from categorisation.normalize import (
    is_bank_boilerplate_label,
    merchant_key,
)
from categorisation.rules import PURCHASE_REVERSAL_RULE, is_purchase_reversal_description
from categorisation.source_identity import identify_source

from .models import FeatureTransaction

ZERO = Decimal("0")

_NON_MERCHANT_GROUP_CLASSES = frozenset(
    {
        "person_to_person",
        "internal_transfer",
        "income",
        "savings",
        "investment",
        "bank_fee",
    }
)
_NON_MERCHANT_SOURCE_TYPES = frozenset(
    {
        "person",
        "bank",
        "payment_processor",
        "payment_mechanism",
    }
)


def amount_of(transaction: FeatureTransaction) -> Decimal:
    """Return a transaction magnitude without assuming source sign conventions."""
    return abs(Decimal(transaction.amount))


def is_purchase_reversal(transaction: FeatureTransaction) -> bool:
    """Return whether this row undoes a payment instead of creating one.

    Identification uses reversal wording or the deterministic reversal rule.
    Other credits, including salary and interest, are unchanged.
    """
    if transaction.categorisation.rule == PURCHASE_REVERSAL_RULE:
        return True
    return is_purchase_reversal_description(transaction.description)


def merchant_group_key(transaction: FeatureTransaction) -> str | None:
    """Return a sanitized stable merchant grouping key, never bank boilerplate.

    People, banks, processors and payment mechanisms are never treated as merchants.
    Free-text extraction is used only when source identity confirms a merchant.
    """
    if transaction.categorisation.transaction_class in _NON_MERCHANT_GROUP_CLASSES:
        return None

    identity = identify_source(transaction.description)
    if identity.source_type in _NON_MERCHANT_SOURCE_TYPES:
        return None

    value = None
    if identity.source_type == "merchant" and identity.merchant_name:
        value = identity.merchant_name
    else:
        value = transaction.merchant_name or transaction.categorisation.merchant_name
        if value and is_bank_boilerplate_label(value):
            value = None

    if not value:
        return None
    key = merchant_key(value)
    return key or None


def month_key(transaction: FeatureTransaction) -> str | None:
    if transaction.transaction_date is None:
        return None
    return transaction.transaction_date.strftime("%Y-%m")
