"""Evidence context for each leak: accounts, window, amount status, limits.

This layer never changes what a rule detected, its confidence, or its
identifiers. It adds an ``analysis`` block saying which accounts and dates the
finding rests on, whether the amount is confirmed, estimated or a possible
duplicate, how it was calculated, which uploaded-statement gaps limit it, and
which other findings are built on the same transactions (so a single loss is
not counted twice).
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from typing import Mapping, Sequence

from .consolidation import chronological_key
from .coverage import AccountRecord, CoverageLimit, StatementCoverage, coverage_limits_for_range
from .leak_models import (
    AccountPattern,
    LeakAnalysisContext,
    LeakDetection,
    LeakDetectionResult,
    LeakResultSummary,
    SourceAccount,
)
from .models import FeatureTransaction

_DUPLICATE_TYPES = frozenset(
    {"duplicate_payment_leak", "duplicate_debit_order_leak", "duplicate_streaming_leak"}
)
_MERCHANT_SERIES_TYPES = frozenset(
    {
        "subscription_leak",
        "recurring_payment_leak",
        "unknown_recurring_payment",
        "inactive_recurring_payment_leak",
        "duplicate_payment_leak",
        "duplicate_debit_order_leak",
        "duplicate_streaming_leak",
    }
)
_ESTIMATED_TYPES = frozenset({"inactive_recurring_payment_leak"})

# Concurrent charges on two accounts this close together are one billing event
# seen twice, not a moved subscription.
CONCURRENT_WINDOW_DAYS = 7
# A subscription that moved cards keeps a roughly monthly rhythm across the join.
MONTHLY_INTERVAL_RANGE = (20, 45)

#: What window and evidence each rule uses, and whether it reads across accounts.
RULE_WINDOWS: dict[str, str] = {
    "bank_fee_leak": (
        "Bank fees are summed from the rows classed as fees over the analysed period (completed "
        "calendar months for trends). Fees are additive facts, so accounts are combined; a "
        "recurring-fee pattern is only recognised within one account's own charges."
    ),
    "subscription_leak": (
        "Charges by one merchant are ordered by date and the gaps between consecutive charges are "
        "measured. Charges on different accounts join one series only when the accounts hand over "
        "in sequence at a monthly rhythm; otherwise they are not treated as one subscription."
    ),
    "recurring_payment_leak": (
        "Charges by one merchant are ordered by date and the actual interval between consecutive "
        "charges decides recurrence and any amount change. Cross-account series need a sequential "
        "monthly hand-over."
    ),
    "spending_escalation_leak": (
        "Spending per completed calendar month across all accounts, with confirmed internal "
        "transfers and refunds removed, compared with the months before it."
    ),
    "duplicate_payment_leak": (
        "Same merchant, same amount (within one cent) on the same calendar day, counted only when "
        "the rows are distinct transactions: statement overlaps are already removed. Matches on "
        "different accounts are reported as a cross-account duplicate."
    ),
    "duplicate_debit_order_leak": (
        "Debit orders from one merchant within five days of each other, with amounts within R25 or "
        "10% and no conflicting mandate reference. Matches on two accounts mean two mandates are "
        "active."
    ),
    "duplicate_streaming_leak": (
        "Active subscriptions to services of the same kind in the same month, from the actual "
        "charge dates. Services may be billed to different accounts."
    ),
    "irregular_transaction_leak": (
        "One transaction compared with the same merchant's own earlier payments, ordered by date, "
        "across all accounts."
    ),
    "inactive_recurring_payment_leak": (
        "A regular payment whose next expected charge has not appeared. Absence is judged only "
        "up to the last day covered by statements for the account that was being charged; it is "
        "never proof of cancellation."
    ),
    "cash_usage_leak": (
        "Cash withdrawals and their fees over completed calendar months, across all accounts."
    ),
    "airtime_data_leak": "Airtime and data purchases and their service fees over completed months.",
    "food_spending_leak": "Convenience-food spending by completed calendar month across accounts.",
    "transport_spending_leak": "Transport spending by completed calendar month across accounts.",
    "coffee_spending_leak": "Coffee purchases by completed calendar month across accounts.",
    "convenience_store_leak": "Convenience-store purchases by completed calendar month across accounts.",
    "weekend_spending_leak": "Spending by day of the week from actual transaction dates, all accounts.",
    "payday_spending_leak": (
        "Spending in the days after detected income, using actual income dates and spending dates."
    ),
    "unknown_recurring_payment": (
        "An unidentified merchant charged at a regular interval, from the actual dates of the "
        "charges."
    ),
}


def _level(confidence: float) -> str:
    if confidence >= 0.8:
        return "high"
    if confidence >= 0.6:
        return "medium"
    return "low"


def _step_down(level: str) -> str:
    return {"high": "medium", "medium": "low", "low": "low"}[level]


def assess_account_pattern(rows: Sequence[FeatureTransaction]) -> AccountPattern:
    """How charges on several accounts relate, from the actual dates.

    ``concurrent_charges``  two accounts charged within a week of each other
    ``sequential_move``     one account then the next, monthly rhythm across the join
    ``unrelated_accounts``  neither: the accounts are not shown to share a series
    """
    ordered = sorted((row for row in rows if row.transaction_date is not None), key=chronological_key)
    accounts = [row.account_id for row in ordered if row.account_id]
    if len(set(accounts)) <= 1:
        return "single_account"

    for index, first in enumerate(ordered):
        for second in ordered[index + 1 :]:
            if (second.transaction_date - first.transaction_date).days > CONCURRENT_WINDOW_DAYS:  # type: ignore[operator]
                break
            if first.account_id and second.account_id and first.account_id != second.account_id:
                return "concurrent_charges"

    switches = sum(1 for before, after in zip(accounts, accounts[1:]) if before != after)
    if switches <= len(set(accounts)) - 1:
        gaps = [
            (later.transaction_date - earlier.transaction_date).days  # type: ignore[operator]
            for earlier, later in zip(ordered, ordered[1:])
        ]
        low, high = MONTHLY_INTERVAL_RANGE
        if gaps and all(low <= gap <= high for gap in gaps):
            return "sequential_move"
    return "unrelated_accounts"


def _label(account_id: str | None, accounts: Mapping[str, AccountRecord]) -> str:
    if account_id and account_id in accounts:
        return accounts[account_id].label
    return "Unlinked account" if account_id is None else "Account"


def _decimal(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except Exception:  # noqa: BLE001 - any unparseable evidence value means "unknown"
        return None
    return number if number.is_finite() else None


def _amounts(rows: Sequence[tuple[FeatureTransaction, str]]) -> Decimal:
    total = Decimal("0")
    for item, role in rows:
        magnitude = abs(item.amount)
        total += -magnitude if role == "reversal" else magnitude
    return max(total, Decimal("0"))


def enrich_leaks(
    result: LeakDetectionResult,
    transactions: Sequence[FeatureTransaction],
    *,
    coverage: StatementCoverage | None = None,
    accounts: Sequence[AccountRecord] = (),
) -> LeakDetectionResult:
    """Attach an ``analysis`` block to every leak and summarise without double counting."""
    by_id = {item.transaction_id: item for item in transactions}
    account_map = {account.account_id: account for account in accounts}
    enriched: list[LeakDetection] = []
    claimed: set[str] = set()
    contexts: dict[str, LeakAnalysisContext] = {}
    id_sets: dict[str, set[str]] = {}

    for leak in result.leaks:
        rows = [
            (by_id[row.transaction_id], row.role)
            for row in leak.supporting_transactions
            if row.transaction_id in by_id
        ]
        rows.sort(key=lambda pair: chronological_key(pair[0]))
        context = _context(leak, rows, coverage, account_map)
        contexts[leak.leak_id] = context
        id_sets[leak.leak_id] = {item.transaction_id for item, _ in rows}

    # Relationship between findings that rest on the same transactions.
    for leak in result.leaks:
        mine = id_sets[leak.leak_id]
        contexts[leak.leak_id].overlaps_with = sorted(
            other.leak_id
            for other in result.leaks
            if other.leak_id != leak.leak_id and mine & id_sets[other.leak_id]
        )

    ordered_for_totals = sorted(
        result.leaks, key=lambda item: (-contexts[item.leak_id].amount, item.leak_id)
    )
    totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for leak in ordered_for_totals:
        context, mine = contexts[leak.leak_id], id_sets[leak.leak_id]
        shared = len(mine & claimed)
        if mine and shared / len(mine) >= 0.5:
            context.counted_in_total = False
            context.confidence_notes.append(
                "Most of this finding's transactions are already part of a larger finding, so its "
                "amount is not added to the combined total again."
            )
        else:
            totals[context.currency] += context.amount
            claimed |= mine

    for leak in result.leaks:
        enriched.append(leak.model_copy(update={"analysis": contexts[leak.leak_id]}))

    summary = LeakResultSummary(
        non_overlapping_amount_by_currency=dict(totals),
        coverage_summary=list(coverage.summary) if coverage else [],
        disclaimer=coverage.disclaimer if coverage else "",
    )
    return result.model_copy(update={"leaks": enriched, "analysis_summary": summary})


def _context(
    leak: LeakDetection,
    rows: Sequence[tuple[FeatureTransaction, str]],
    coverage: StatementCoverage | None,
    accounts: Mapping[str, AccountRecord],
) -> LeakAnalysisContext:
    items = [item for item, _ in rows]
    dated = [item.transaction_date for item in items if item.transaction_date is not None]
    start: date | None = min(dated) if dated else leak.period_start
    end: date | None = max(dated) if dated else leak.period_end

    grouped: dict[str | None, list[tuple[FeatureTransaction, str]]] = defaultdict(list)
    for pair in rows:
        grouped[pair[0].account_id].append(pair)
    source_accounts = [
        SourceAccount(
            account_id=account_id,
            label=_label(account_id, accounts),
            transaction_count=len(group),
            amount=_amounts(group),
        )
        for account_id, group in sorted(grouped.items(), key=lambda entry: (entry[0] is None, entry[0] or ""))
    ]
    known_accounts = {account_id for account_id in grouped if account_id}
    cross_account = len(known_accounts) > 1

    pattern: AccountPattern = "single_account"
    if cross_account:
        pattern = (
            assess_account_pattern(items)
            if leak.leak_type in _MERCHANT_SERIES_TYPES
            else "consolidated_across_accounts"
        )

    notes: list[str] = []
    level = _level(leak.confidence)
    if pattern == "unrelated_accounts":
        level = _step_down(level)
        notes.append(
            "Charges on different accounts were not shown to belong to one series, so the pattern "
            "is treated with less confidence."
        )
    elif pattern == "concurrent_charges":
        notes.append(
            "Charges were made on more than one account within a week, which points to two "
            "active arrangements rather than one."
        )
    elif pattern == "sequential_move":
        notes.append(
            "The charge moved from one account to another at a monthly rhythm, so it is read as "
            "one series."
        )

    low_dates = sum(1 for item in items if item.date_confidence == "low")
    if items and low_dates / len(items) >= 0.25:
        level = _step_down(level)
        notes.append(
            f"{low_dates} of {len(items)} supporting dates were read with low confidence."
        )
    possible = sum(1 for item in items if item.dedupe_status == "possible_duplicate")
    if possible:
        notes.append(
            f"{possible} supporting transaction(s) might also appear in an overlapping statement "
            "and are kept pending review."
        )

    limits: list[CoverageLimit] = []
    if coverage is not None:
        limits = coverage_limits_for_range(coverage, known_accounts, start, end)
        if any(limit.materially_limits for limit in limits):
            level = _step_down(level)
            notes.append("Missing or unreliable statement coverage limits this finding.")

    amount_total = _amounts(rows)
    if leak.leak_type in _DUPLICATE_TYPES:
        # The rows behind a duplicate finding include the merchant's whole
        # history; the duplicate is only the repeats inside one group.
        candidate = _decimal(leak.evidence.get("candidate_amount"))
        group = leak.evidence.get("transaction_count_in_group")
        if candidate is not None and isinstance(group, int) and group > 1:
            extra = candidate * (group - 1)
            how = "Amount is the repeat charges in the duplicate group: one charge is expected, the rest are extra."
        else:
            extra = leak.estimated_monthly_impact
            how = "Amount is the estimated monthly cost of the overlapping service."
        amount, status = extra, "potentially_duplicated"
    elif leak.leak_type in _ESTIMATED_TYPES or leak.impact_kind == "estimated" or not rows:
        amount = amount_total if rows and leak.leak_type not in _ESTIMATED_TYPES else leak.estimated_monthly_impact
        status = "estimated"
        how = "Amount is an estimate of the monthly cost, not a sum of observed charges."
    else:
        amount, status = amount_total, "confirmed"
        how = "Amount is the total of the supporting transactions, with reversals taken off."

    currencies = Counter((item.currency or "ZAR").upper() for item in items)
    currency = currencies.most_common(1)[0][0] if currencies else "ZAR"
    window = RULE_WINDOWS.get(leak.leak_type, "")
    span = f"{start:%d %b %Y} to {end:%d %b %Y}" if start and end else "the available history"
    calculation = (
        f"{window} Analysed {len(items)} transaction(s) across {max(len(known_accounts), 1)} "
        f"account(s) from {span}. {how}"
    ).strip()

    return LeakAnalysisContext(
        source_accounts=source_accounts,
        cross_account=cross_account,
        account_pattern=pattern,
        date_range_start=start,
        date_range_end=end,
        window_rule=window,
        amount=amount,
        currency=currency,
        amount_status=status,  # type: ignore[arg-type]
        confidence_level=level,  # type: ignore[arg-type]
        confidence_notes=notes,
        coverage_limits=limits,
        calculation=calculation,
    )
