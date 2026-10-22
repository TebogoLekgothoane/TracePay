"""Attach the transactions behind each leak, selected deterministically.

The leak detectors work from aggregated features, so the rows that triggered a
finding are not carried along. This module re-selects them with the same
helpers the detectors use, so what is shown always matches what was counted.
Descriptions are redacted; reference numbers never leave the API.
"""

from __future__ import annotations

import re

from categorisation.normalize import merchant_key as normalise_merchant_key
from categorisation.normalize import normalize_for_matching
from categorisation.rules import recognised_merchant_label
from categorisation.sanitizer import sanitize_for_ai

from .common import amount_of, is_purchase_reversal, merchant_group_key
from .engine import _fee_subtype
from .leak_models import LeakDetection, LeakDetectionResult, SupportingTransaction
from .models import FeatureTransaction

MAX_SUPPORTING_TRANSACTIONS = 200

_MASKED_NUMBER = re.compile(r"\+?\d{0,3}[•*]{3,}\d{2,4}")

Selected = list[tuple[FeatureTransaction, str]]

# bank_fee_leak focus -> fee subtypes that make up the finding.
_FEE_FOCUS_SUBTYPES: dict[str, frozenset[str]] = {
    "sms_banking": frozenset({"sms"}),
    "atm_balance_enquiry": frozenset({"balance_enquiry"}),
    "immediate_payment_fee": frozenset({"immediate_payment"}),
    "foreign_transaction_fee": frozenset({"foreign"}),
    "interest_charges": frozenset({"interest"}),
    "overdraft_fee_pattern": frozenset({"overdraft"}),
    "insufficient_funds_charges": frozenset({"insufficient_funds"}),
    "recurring_merchant_fee_change": frozenset({"card"}),
}
_MERCHANT_LEAKS = frozenset(
    {
        "subscription_leak",
        "recurring_payment_leak",
        "unknown_recurring_payment",
        "inactive_recurring_payment_leak",
        "duplicate_payment_leak",
        "duplicate_debit_order_leak",
        "duplicate_streaming_leak",
        "coffee_spending_leak",
        "convenience_store_leak",
    }
)


def attach_supporting_transactions(
    result: LeakDetectionResult, transactions: list[FeatureTransaction]
) -> LeakDetectionResult:
    live = [
        item
        for item in transactions
        if not item.is_duplicate and item.transaction_date is not None
    ]
    return result.model_copy(
        update={"leaks": [_with_support(leak, live) for leak in result.leaks]}
    )


def _with_support(leak: LeakDetection, transactions: list[FeatureTransaction]) -> LeakDetection:
    selected = _select(leak, transactions)
    selected.sort(key=lambda row: (row[0].transaction_date, row[0].transaction_id))
    rows = [
        SupportingTransaction(
            transaction_id=item.transaction_id,
            date=item.transaction_date,
            description=_redact(item.description),
            amount=amount_of(item),
            direction=item.transaction_type or "debit",
            role=role,
        )
        for item, role in selected[:MAX_SUPPORTING_TRANSACTIONS]
    ]
    return leak.model_copy(
        update={
            "supporting_transactions": rows,
            "supporting_transaction_count": len(selected),
        }
    )


def _select(leak: LeakDetection, transactions: list[FeatureTransaction]) -> Selected:
    evidence = leak.evidence
    if leak.leak_type == "bank_fee_leak":
        return _fee_rows(evidence.get("finding_focus"), transactions)
    if leak.leak_type == "irregular_transaction_leak":
        target = evidence.get("transaction_id")
        return [(item, "payment") for item in transactions if item.transaction_id == target]
    key = evidence.get("merchant_key")
    if leak.leak_type in _MERCHANT_LEAKS and isinstance(key, str):
        return _merchant_rows(key, transactions)
    category = evidence.get("category_name")
    if isinstance(category, str):
        rows = _category_rows(
            category, transactions, with_vas_fees=leak.leak_type == "airtime_data_leak"
        )
        # Habit spend is measured over completed months; fees match the
        # whole-period fee total reported in the evidence.
        totals = evidence.get("monthly_totals")
        if isinstance(totals, dict) and totals:
            rows = [
                (item, role)
                for item, role in rows
                if role == "fee" or item.transaction_date.strftime("%Y-%m") in totals
            ]
        return rows
    return []


def _fee_rows(focus: object, transactions: list[FeatureTransaction]) -> Selected:
    subtypes = _FEE_FOCUS_SUBTYPES.get(focus) if isinstance(focus, str) else None
    rows: Selected = []
    for item in transactions:
        if item.categorisation.transaction_class != "bank_fee" or is_purchase_reversal(item):
            continue
        typed = subtypes is not None and _fee_subtype(item) in subtypes
        rows.append((item, "fee" if subtypes is None or typed else "other_fee"))
    return rows


def _merchant_rows(key: str, transactions: list[FeatureTransaction]) -> Selected:
    wanted = key.casefold()
    rows: Selected = []
    for item in transactions:
        if item.categorisation.transaction_class == "bank_fee":
            if _fee_merchant(item) == wanted:
                rows.append((item, "failed_attempt_fee" if _is_failed_attempt(item) else "fee"))
            continue
        merchant = merchant_group_key(item)
        if merchant is None or merchant.casefold() != wanted:
            continue
        if is_purchase_reversal(item):
            rows.append((item, "reversal"))
        elif item.transaction_type in {"debit", None}:
            rows.append((item, "payment"))
    return rows


def _category_rows(
    category: str, transactions: list[FeatureTransaction], *, with_vas_fees: bool
) -> Selected:
    rows: Selected = []
    for item in transactions:
        result = item.categorisation
        if result.transaction_class == "bank_fee":
            if with_vas_fees and _fee_subtype(item) == "vas":
                rows.append((item, "fee"))
            continue
        if result.category_name != category or result.transaction_class != "spending":
            continue
        if is_purchase_reversal(item):
            rows.append((item, "reversal"))
        elif item.transaction_type in {"debit", None}:
            rows.append((item, "payment"))
    return rows


def _redact(description: str | None) -> str:
    cleaned = _MASKED_NUMBER.sub("[MASKED]", " ".join((description or "").split()))
    return sanitize_for_ai(cleaned)[:300]


def _fee_merchant(item: FeatureTransaction) -> str | None:
    label = recognised_merchant_label(normalize_for_matching(item.description))
    return normalise_merchant_key(label).casefold() if label else None


def _is_failed_attempt(item: FeatureTransaction) -> bool:
    text = (item.description or "").upper()
    return "UNSUCCESSFUL" in text or "INSUFFICIENT FUNDS" in text
