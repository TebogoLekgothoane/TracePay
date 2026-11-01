"""Overlap between findings and a total that never counts one loss twice.

Every finding stays its own record with its own evidence. This module only reads
them. It answers three questions the individual findings cannot:

* which findings rest on the same transactions or the same financial event,
* what the findings amount to together without adding one event twice, and
* what has actually been paid (history) versus what may keep costing (estimate).

Two findings that merely share a merchant are not merged. They are linked only
when the transactions that produce their amounts are the same, or when one
finding is explicitly built from the other's merchants (combined streaming).
Findings of different kinds are never netted against each other: a one-time
extra charge and a recurring service cost are reported in separate buckets.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Iterable

from .leak_models import (
    Bucket,
    EvidenceStatusName,
    FindingImpact,
    FindingOverlap,
    ImpactSummary,
    LeakDetection,
    LeakDetectionResult,
)

AMOUNT_TOLERANCE = Decimal("0.01")

# Evidence key holding what a fee finding actually charged, by focus.
_FEE_TOTAL_KEYS = {
    "immediate_payment_fee": "immediate_payment_fee_total",
    "foreign_transaction_fee": "foreign_transaction_fee_total",
    "interest_charges": "interest_charge_total",
    "overdraft_fee_pattern": "overdraft_fee_total",
    "insufficient_funds_charges": "insufficient_funds_fee_total",
    "sms_banking": "sms_fee_total",
    "atm_balance_enquiry": "balance_enquiry_fee_total",
    "recurring_merchant_fee_change": "card_fee_total",
}
_DUPLICATE_TYPES = frozenset({"duplicate_payment_leak", "duplicate_debit_order_leak"})


def summarise_impact(leaks: Iterable[LeakDetection]) -> ImpactSummary:
    leaks = list(leaks)
    counted = {leak.leak_id: _counted_ids(leak) for leak in leaks}
    merchants = {leak.leak_id: _streaming_merchants(leak) for leak in leaks}
    bucket = {leak.leak_id: _bucket(leak) for leak in leaks}

    parent = {leak.leak_id: leak.leak_id for leak in leaks}

    def find(item: str) -> str:
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    overlaps: list[FindingOverlap] = []
    partners: dict[str, set[str]] = {leak.leak_id: set() for leak in leaks}
    for index, first in enumerate(leaks):
        for second in leaks[index + 1 :]:
            shared_ids = sorted(counted[first.leak_id] & counted[second.leak_id])
            shared_merchants = sorted(
                _merchant_links(first, second, merchants)
            )
            if not shared_ids and not shared_merchants:
                continue
            relation = _relation(first, second, bool(shared_ids))
            overlaps.append(
                FindingOverlap(
                    leak_ids=[first.leak_id, second.leak_id],
                    shared_transaction_count=len(shared_ids),
                    shared_merchants=shared_merchants,
                    relation=relation,
                )
            )
            partners[first.leak_id].add(second.leak_id)
            partners[second.leak_id].add(first.leak_id)
            # A one-time extra charge and a recurring cost are different losses,
            # so they are reported as overlapping but never netted together.
            if bucket[first.leak_id] == bucket[second.leak_id]:
                parent[find(first.leak_id)] = find(second.leak_id)

    group_ids: dict[str, int] = {}
    for leak in leaks:
        group_ids.setdefault(find(leak.leak_id), len(group_ids))

    totals: dict[Bucket, Decimal] = {"recurring_monthly": Decimal("0"), "one_time": Decimal("0")}
    naive: dict[Bucket, Decimal] = {"recurring_monthly": Decimal("0"), "one_time": Decimal("0")}
    by_status: dict[str, Decimal] = {}
    observed_total = Decimal("0")
    unquantified: list[str] = []
    impacts: list[FindingImpact] = []

    members: dict[int, list[LeakDetection]] = {}
    for leak in leaks:
        members.setdefault(group_ids[find(leak.leak_id)], []).append(leak)

    for group, items in members.items():
        # Within one event only the largest amount stands; the others describe
        # the same money from another angle.
        keeper = max(
            items,
            key=lambda item: (
                item.estimated_monthly_impact,
                _SPECIFICITY.get(_basis(item), 0),
                item.leak_id,
            ),
        )
        observed_values = {item.leak_id: _observed_amount(item) for item in items}
        observed_keeper = max(
            (value for value in observed_values.values() if value is not None), default=None
        )
        group_bucket = bucket[keeper.leak_id]
        for item in items:
            amount = item.estimated_monthly_impact
            naive[bucket[item.leak_id]] += amount
            observed = observed_values[item.leak_id]
            if observed is None:
                unquantified.append(item.leak_id)
            impacts.append(
                FindingImpact(
                    leak_id=item.leak_id,
                    bucket=bucket[item.leak_id],
                    basis=_basis(item),
                    evidence_status=_status(item),
                    amount=amount,
                    observed_amount=observed,
                    group_id=group,
                    counted_in_total=item.leak_id == keeper.leak_id,
                    overlaps_with=sorted(partners[item.leak_id]),
                    explained_by=[
                        str(value) for value in item.evidence.get("explained_by_leak_ids") or []
                    ],
                    display=not item.evidence.get("redundant_for_display"),
                )
            )
        totals[group_bucket] += keeper.estimated_monthly_impact
        if group_bucket == "recurring_monthly":
            status = _status(keeper)
            by_status[status] = by_status.get(status, Decimal("0")) + keeper.estimated_monthly_impact
        if observed_keeper is not None:
            observed_total += observed_keeper

    prevented = (naive["recurring_monthly"] - totals["recurring_monthly"]) + (
        naive["one_time"] - totals["one_time"]
    )
    notes = [
        "Potential amounts are estimates that need verification; they are not money lost.",
        "Recurring monthly and one-time amounts are kept apart and never added together.",
    ]
    if prevented > 0:
        notes.append(
            f"R{prevented:,.2f} was not counted again because findings describe the same transactions."
        )
    return ImpactSummary(
        recurring_monthly_potential=totals["recurring_monthly"],
        recurring_monthly_before_dedupe=naive["recurring_monthly"],
        one_time_potential=totals["one_time"],
        one_time_before_dedupe=naive["one_time"],
        double_counting_prevented=prevented,
        observed_total_paid=observed_total,
        recurring_monthly_by_status=by_status,
        findings_without_observed_amount=sorted(unquantified),
        overlaps=overlaps,
        findings=impacts,
        notes=notes,
    )


def _bucket(leak: LeakDetection) -> Bucket:
    # A one-period change in spending happened once; it is not a monthly cost.
    single_period = leak.evidence.get("annual_impact_omitted_reason") == "single_period_estimated_change"
    return "one_time" if leak.impact_kind == "one_time" or single_period else "recurring_monthly"


# When two findings describe one event, the more specific one is the one counted.
_SPECIFICITY = {
    "duplicate_extra_charge": 3,
    "trial_conversion_cost": 3,
    "price_increase": 3,
    "gambling_spend": 2,
    "penalty_fees": 2,
    "fees": 2,
    "unverified_recurring_payee": 2,
    "service_cost": 1,
    "period_increase": 0,
    "spending_pattern": 0,
}


def _status(leak: LeakDetection) -> EvidenceStatusName:
    value = leak.evidence.get("evidence_status")
    return value if value in {"confirmed", "likely", "possible"} else "possible"  # type: ignore[return-value]


def _basis(leak: LeakDetection) -> str:
    evidence = leak.evidence
    if leak.leak_type in _DUPLICATE_TYPES:
        return "duplicate_extra_charge"
    if evidence.get("headline_impact_basis") == "price_increase":
        return "price_increase"
    if evidence.get("finding_focus") == "trial_conversion":
        return "trial_conversion_cost"
    if leak.leak_type == "gambling_spending_leak":
        return "gambling_spend"
    if leak.leak_type == "penalty_fee_leak":
        return "penalty_fees"
    if evidence.get("finding_focus") == "unidentified_recurring_merchant":
        return "unverified_recurring_payee"
    if leak.leak_type == "bank_fee_leak":
        return "fees"
    if leak.leak_type in {"subscription_leak", "recurring_payment_leak", "unknown_recurring_payment"}:
        return "service_cost"
    if _is_aggregate(leak):
        return "period_increase"
    return "spending_pattern"


def _dec(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except Exception:  # noqa: BLE001 - unparseable evidence means unknown
        return None
    return number if number.is_finite() else None


def _day(value: object) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def _counted_ids(leak: LeakDetection) -> set[str]:
    """The transactions that produce this finding's amount, not all its context.

    A duplicate finding lists a merchant's whole history as support, but only the
    repeated charge is the loss. A price-rise finding is only the part of each
    payment above the original price.
    """
    evidence = leak.evidence
    rows = [row for row in leak.supporting_transactions if row.role in {"payment", "fee"}]
    if leak.leak_type in _DUPLICATE_TYPES:
        candidate = _dec(evidence.get("candidate_amount"))
        start = _day(evidence.get("observed_date"))
        end = _day(evidence.get("latest_observed_date")) or start
        spread = _dec(evidence.get("amount_variance")) or Decimal("0")
        if candidate is None or start is None or end is None:
            return set()
        return {
            row.transaction_id
            for row in rows
            if start <= row.date <= end
            and abs(row.amount - candidate) <= spread + AMOUNT_TOLERANCE
        }
    if evidence.get("headline_impact_basis") == "price_increase":
        original = _dec(evidence.get("original_recurring_amount"))
        if original is None:
            return set()
        return {row.transaction_id for row in rows if row.amount > original + AMOUNT_TOLERANCE}
    if evidence.get("finding_focus") == "trial_conversion":
        first_paid = _day(evidence.get("first_paid_date"))
        return {
            row.transaction_id
            for row in rows
            if row.amount > 0 and first_paid is not None and row.date >= first_paid
        }
    if _is_aggregate(leak):
        return escalation_increase_ids(leak)
    if evidence.get("streaming_merchants"):
        return set()
    return {row.transaction_id for row in rows}


def _is_aggregate(leak: LeakDetection) -> bool:
    """A finding about a period's total (overall or one category) rising."""
    return leak.leak_type == "spending_escalation_leak" or leak.evidence.get("increase_rows") is not None


# Findings about one specific event. An aggregate increase made only of the rows
# of such a finding adds nothing a customer needs to see separately.
_SPECIFIC_BASES = frozenset(
    {
        "duplicate_extra_charge",
        "trial_conversion_cost",
        "price_increase",
        "gambling_spend",
        "penalty_fees",
    }
)


def _is_specific_event(leak: LeakDetection) -> bool:
    return leak.leak_type == "irregular_transaction_leak" or _basis(leak) in _SPECIFIC_BASES


def mark_explained_findings(result: LeakDetectionResult) -> LeakDetectionResult:
    """Link each aggregate increase to the specific findings that account for it.

    An increase is explained when every row that makes it up is also a row of one
    or more specific findings (a duplicate charge, an unusual transaction, a price
    rise). That is a statement about shared transactions, so there is no amount
    threshold: R449 or R450 makes no difference when the rows are the same. Both
    findings are kept; the aggregate is marked so it is not shown as a second
    finding. An increase with any row of its own stays visible.
    """
    counted = {leak.leak_id: _counted_ids(leak) for leak in result.leaks}
    updated: list[LeakDetection] = []
    for leak in result.leaks:
        ids = counted[leak.leak_id] if _is_aggregate(leak) else set()
        if not ids:
            updated.append(leak)
            continue
        explainers = [
            other
            for other in result.leaks
            if other.leak_id != leak.leak_id
            and not _is_aggregate(other)
            and _is_specific_event(other)
            and counted[other.leak_id] & ids
        ]
        covered = set().union(*(counted[other.leak_id] & ids for other in explainers)) if explainers else set()
        if covered != ids:
            updated.append(leak)
            continue
        rows = {row.transaction_id: row.amount for row in leak.supporting_transactions}
        explained_amount = min(
            sum((rows.get(item, Decimal("0")) for item in covered), Decimal("0")),
            leak.estimated_monthly_impact,
        )
        updated.append(
            leak.model_copy(
                update={
                    "evidence": {
                        **leak.evidence,
                        "explained_by_leak_ids": sorted(other.leak_id for other in explainers),
                        "explained_amount": explained_amount,
                        "redundant_for_display": True,
                    }
                }
            )
        )
    return result.model_copy(update={"leaks": updated})


def split_for_display(result: LeakDetectionResult) -> LeakDetectionResult:
    """Keep explained findings out of the list a customer sees, but not out of the result."""
    visible = [leak for leak in result.leaks if not leak.evidence.get("redundant_for_display")]
    hidden = [leak for leak in result.leaks if leak.evidence.get("redundant_for_display")]
    if not hidden:
        return result
    return result.model_copy(
        update={"leaks": visible, "explained_leaks": [*result.explained_leaks, *hidden]}
    )


def escalation_increase_ids(leak: LeakDetection) -> set[str]:
    """Rows that make up the increase itself, not the baseline they are compared with."""
    wanted: set[tuple[date, Decimal]] = set()
    for item in leak.evidence.get("increase_rows") or []:
        if not isinstance(item, dict):
            continue
        when, amount = _day(item.get("date")), _dec(item.get("amount"))
        if when is not None and amount is not None:
            wanted.add((when, amount))
    return {
        row.transaction_id
        for row in leak.supporting_transactions
        if row.role == "payment" and (row.date, row.amount) in wanted
    }


def _streaming_merchants(leak: LeakDetection) -> set[str]:
    merchants = leak.evidence.get("streaming_merchants") or leak.evidence.get("combined_merchants")
    return {str(item) for item in merchants} if isinstance(merchants, list) else set()


def _merchant_links(
    first: LeakDetection, second: LeakDetection, merchants: dict[str, set[str]]
) -> set[str]:
    """Merchants one finding explicitly combines and the other reports on its own."""
    one, other = merchants[first.leak_id], merchants[second.leak_id]
    if one and not other:
        key = second.evidence.get("merchant_key")
        return {key} & one if isinstance(key, str) else set()
    if other and not one:
        key = first.evidence.get("merchant_key")
        return {key} & other if isinstance(key, str) else set()
    return set()


def _relation(first: LeakDetection, second: LeakDetection, shares_rows: bool) -> str:
    bases = {_basis(first), _basis(second)}
    if "price_increase" in bases and "service_cost" in bases:
        return "price_increase_is_part_of_service_cost"
    if "period_increase" in bases and len(bases) == 1:
        return "overlapping_period_increases"
    if bases == {"period_increase", "duplicate_extra_charge"}:
        return "period_increase_is_the_duplicate_charge"
    if "duplicate_extra_charge" in bases and len(bases) > 1:
        return "duplicate_charge_inside_other_finding"
    if "trial_conversion_cost" in bases and "service_cost" in bases:
        return "trial_conversion_is_part_of_service_cost"
    if not shares_rows:
        return "combined_finding_includes_this_merchant"
    return "same_transactions"


def _observed_amount(leak: LeakDetection) -> Decimal | None:
    """Money actually paid that this finding rests on, or None when it states none."""
    evidence = leak.evidence
    if leak.leak_type in _DUPLICATE_TYPES:
        candidate = _dec(evidence.get("candidate_amount"))
        count = evidence.get("transaction_count_in_group")
        if candidate is not None and isinstance(count, int) and count > 1:
            return candidate * (count - 1)
        return None
    if evidence.get("headline_impact_basis") == "price_increase":
        return _dec(evidence.get("additional_paid_to_date"))
    if leak.leak_type == "spending_escalation_leak":
        # The extra outflow in the current month against its baseline did happen.
        return _dec(evidence.get("change_amount"))
    for key in ("observed_total_paid",):
        value = _dec(evidence.get(key))
        if value is not None:
            return value
    focus = evidence.get("finding_focus")
    if leak.leak_type == "bank_fee_leak" and isinstance(focus, str):
        key = _FEE_TOTAL_KEYS.get(focus)
        return _dec(evidence.get(key)) if key else None
    return None
