"""Attach the transactions behind each leak, selected deterministically.

The leak detectors work from aggregated features, so the rows that triggered a
finding are not carried along. This module re-selects them with the same
helpers the detectors use, so what is shown always matches what was counted.
Descriptions are redacted; reference numbers never leave the API.
"""

from __future__ import annotations

import re
from decimal import Decimal

from categorisation.normalize import merchant_key as normalise_merchant_key
from categorisation.normalize import normalize_for_matching
from categorisation.rules import recognised_merchant_label
from categorisation.sanitizer import sanitize_for_ai

from .common import amount_of, is_purchase_reversal, merchant_group_key, month_key
from .engine import _fee_subtype, _is_cash_withdrawal, _purchase_outflow
from .leak_models import LeakDetection, LeakDetectionResult, SupportingTransaction
from .models import FeatureTransaction
from .payee_candidates import unidentified_signature

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
        "overlapping_cover_leak",
        "gambling_spending_leak",
        "high_cost_credit_leak",
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
    evidence_update: dict[str, object] = {}
    if leak.leak_type == "spending_escalation_leak":
        selected, evidence_update = _escalation_rows(leak, transactions)
    elif _is_period_growth(leak):
        selected, evidence_update = _category_growth_rows(leak, transactions)
    else:
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
    # Every finding says whether transactions back it. Where none can be tied to
    # it, it says so, so an empty list is never mistaken for missing data.
    evidence_update = {
        **evidence_update,
        "transaction_evidence": "attached" if rows else "insufficient",
        **(
            {}
            if rows
            else {
                "transaction_evidence_reason": (
                    "No individual transactions could be tied to this finding from the statement "
                    "data, so none are shown."
                )
            }
        ),
    }
    update: dict[str, object] = {
        "supporting_transactions": rows,
        "supporting_transaction_count": len(selected),
        "evidence": {**leak.evidence, **evidence_update},
    }
    return leak.model_copy(update=update)


_AMOUNT_TOLERANCE = Decimal("0.01")


def _is_period_growth(leak: LeakDetection) -> bool:
    """A category finding built from a current month against baseline months."""
    evidence = leak.evidence
    return (
        isinstance(evidence.get("category_name"), str)
        and isinstance(evidence.get("current_period"), str)
        and bool(evidence.get("baseline_months"))
    )


def _increase_rows(
    current_rows: list[FeatureTransaction], increase: Decimal
) -> list[FeatureTransaction]:
    """The latest current rows that together cover the increase."""
    covered, picked = Decimal("0"), []
    for item in reversed(current_rows):
        picked.append(item)
        covered += amount_of(item)
        if covered >= increase - _AMOUNT_TOLERANCE:
            break
    return list(reversed(picked))


def _category_growth_rows(
    leak: LeakDetection, transactions: list[FeatureTransaction]
) -> tuple[Selected, dict[str, object]]:
    """Rows behind a category's growth: its baseline and current months only."""
    evidence = leak.evidence
    category = str(evidence["category_name"])
    current = str(evidence["current_period"])
    baseline = {str(item) for item in evidence.get("baseline_months") or []}
    try:
        increase = Decimal(str(evidence.get("change_amount")))
    except Exception:  # noqa: BLE001 - an unreadable figure means no attribution
        return [], {}
    months = baseline | {current}
    rows = [
        (item, role)
        for item, role in _category_rows(category, transactions, with_vas_fees=False)
        if role == "payment" and month_key(item) in months
    ]
    latest = sorted(
        (item for item, _ in rows if month_key(item) == current),
        key=lambda item: (item.transaction_date, item.transaction_id),
    )
    picked = _increase_rows(latest, increase)
    return rows, (
        {
            "increase_rows": [
                {
                    "category": category,
                    "date": item.transaction_date.isoformat(),
                    "amount": amount_of(item),
                }
                for item in picked
            ]
        }
        if picked
        else {}
    )


def _escalation_rows(
    leak: LeakDetection, transactions: list[FeatureTransaction]
) -> tuple[Selected, dict[str, object]]:
    """The rows behind an overall spending increase, taken only from what the finding named.

    For each merchant whose own spend rose, the rows in the baseline months and in
    the current month are attached. The ``increase_rows`` are the latest current
    rows that together cover that merchant's increase, so a duplicate charge shows
    up as the repeat. Nothing is attached when no merchant could be tied to the
    increase, and no row is ever made up.
    """
    evidence = leak.evidence
    current = evidence.get("current_period")
    baseline = {str(item) for item in evidence.get("baseline_months") or []}
    contributors = evidence.get("top_merchant_contributors") or []
    if not isinstance(current, str) or not baseline or not isinstance(contributors, list):
        return [], {}
    months = baseline | {current}
    selected: Selected = []
    increase_rows: list[dict[str, object]] = []
    for contributor in contributors:
        if not isinstance(contributor, dict):
            continue
        key = contributor.get("merchant_key")
        try:
            increase = Decimal(str(contributor.get("change_amount")))
        except Exception:  # noqa: BLE001 - an unreadable figure means no attribution
            continue
        if not isinstance(key, str):
            continue
        wanted = key.casefold()
        rows = [
            item
            for item in transactions
            if _purchase_outflow(item)
            and not is_purchase_reversal(item)
            and month_key(item) in months
            and (merchant := merchant_group_key(item)) is not None
            and merchant.casefold() == wanted
        ]
        earlier = [item for item in rows if month_key(item) in baseline]
        latest = sorted(
            (item for item in rows if month_key(item) == current),
            key=lambda item: (item.transaction_date, item.transaction_id),
        )
        selected.extend((item, "payment") for item in [*earlier, *latest])
        increase_rows.extend(
            {
                "merchant": key,
                "date": item.transaction_date.isoformat(),
                "amount": amount_of(item),
            }
            for item in _increase_rows(latest, increase)
        )
    return selected, ({"increase_rows": increase_rows} if increase_rows else {})


def _select(leak: LeakDetection, transactions: list[FeatureTransaction]) -> Selected:
    evidence = leak.evidence
    if leak.leak_type == "bank_fee_leak":
        return _fee_rows(evidence.get("finding_focus"), transactions)
    if leak.leak_type == "recurring_transfer_leak":
        wanted = evidence.get("recipient_transaction_ids")
        ids = {str(item) for item in wanted} if isinstance(wanted, list) else set()
        return [(item, "payment") for item in transactions if item.transaction_id in ids]
    if leak.leak_type == "money_pass_through_leak":
        wanted = evidence.get("event_transaction_ids")
        ids = {str(item) for item in wanted} if isinstance(wanted, list) else set()
        return [(item, "payment") for item in transactions if item.transaction_id in ids]
    if leak.leak_type == "penalty_fee_leak":
        wanted = evidence.get("penalty_transaction_ids")
        ids = {str(item) for item in wanted} if isinstance(wanted, list) else set()
        return [(item, "fee") for item in transactions if item.transaction_id in ids]
    if leak.leak_type == "irregular_transaction_leak":
        target = evidence.get("transaction_id")
        return [(item, "payment") for item in transactions if item.transaction_id == target]
    if isinstance(evidence.get("description_signature"), str) and not isinstance(
        evidence.get("merchant_key"), str
    ):
        # A payee that is not a recognised merchant: its rows are those whose
        # description carries the same distinctive words.
        signature = evidence.get("description_signature")
        return [
            (item, "payment")
            for item in transactions
            if signature is not None and unidentified_signature(item) == signature
        ]
    combined = _COMBINED_MERCHANT_KEY.get(leak.leak_type)
    if combined is not None and isinstance(evidence.get(combined), list):
        # A combined finding: the payments of each service or provider it lists.
        rows: Selected = []
        for service in evidence[combined]:
            if isinstance(service, str):
                rows.extend(_merchant_rows(service, transactions))
        return rows
    if leak.leak_type == "cash_usage_leak":
        return _cash_rows(transactions)
    key = evidence.get("merchant_key")
    if leak.leak_type in _MERCHANT_LEAKS and not isinstance(key, str):
        # The finding withholds an unreliable merchant name, but the rows it was
        # built from are still the ones in its own feature reference.
        for reference in leak.supporting_feature_references:
            match = _MERCHANT_REFERENCE.search(reference)
            if match:
                key = match.group(1)
                break
    if leak.leak_type in _MERCHANT_LEAKS and isinstance(key, str):
        rows = _merchant_rows(key, transactions)
        series = evidence.get("series_amount")
        if series is not None:
            # A finding read from one regular amount shows that amount's charges only,
            # within the same tolerance used to find the series.
            anchor = Decimal(str(series))
            return [
                (item, role)
                for item, role in rows
                if abs(amount_of(item) - anchor) <= anchor * Decimal("0.08")
            ]
        return rows
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


# Evidence key listing the merchants a combined finding is built from.
_COMBINED_MERCHANT_KEY = {
    "duplicate_streaming_leak": "streaming_merchants",
    "overlapping_cover_leak": "combined_merchants",
    "high_cost_credit_leak": "combined_merchants",
    "gambling_spending_leak": "gambling_merchants",
}

_MERCHANT_REFERENCE = re.compile(r"merchants\[(.+?)\]")


def _cash_rows(transactions: list[FeatureTransaction]) -> Selected:
    """Cash withdrawals and the ATM fees charged on them."""
    rows: Selected = []
    for item in transactions:
        if is_purchase_reversal(item):
            continue
        if item.categorisation.transaction_class == "bank_fee":
            if _fee_subtype(item) == "atm":
                rows.append((item, "fee"))
        elif _is_cash_withdrawal(item) and item.transaction_type in {"debit", None}:
            rows.append((item, "payment"))
    return rows


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
