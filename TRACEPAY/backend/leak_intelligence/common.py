"""Shared, side-effect-free helpers for financial feature calculation."""

from __future__ import annotations

from decimal import Decimal

from categorisation.normalize import merchant_key
from categorisation.rules import PURCHASE_REVERSAL_RULE, is_purchase_reversal_description

from .models import FeatureTransaction

ZERO = Decimal("0")


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
    """Return a sanitized stable merchant grouping key, never a raw description."""
    value = transaction.merchant_name or transaction.categorisation.merchant_name
    if not value:
        value = transaction.description
    key = merchant_key(value)
    return key or None


def month_key(transaction: FeatureTransaction) -> str | None:
    if transaction.transaction_date is None:
        return None
    return transaction.transaction_date.strftime("%Y-%m")
