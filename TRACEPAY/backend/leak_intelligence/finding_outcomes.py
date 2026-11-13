"""Outcome checks for findings already stored before this statement import.

These checks compare the current detector result with the registry. They do not
change lifecycle status, user responses, or signature generation, and they do
not record savings.
"""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime
from typing import Sequence
from uuid import uuid4

from leak_intelligence.behaviour_engine import MIN_TREND_MONTHS
from leak_intelligence.engine import RECURRENCE_MIN_OBSERVATIONS
from leak_intelligence.finding_diff import (
    RegistryCompositionError,
    RegistryPlan,
    RegistryRow,
    RegistryScopeError,
)

OUTCOMES = frozenset(
    {
        "still_present",
        "no_longer_detected",
        "insufficient_new_history",
        "materially_changed",
    }
)
_RECURRING = frozenset(
    {
        "subscription_leak",
        "recurring_payment_leak",
        "unknown_recurring_payment",
        "inactive_recurring_payment_leak",
    }
)
_TREND = frozenset(
    {
        "bank_fee_leak",
        "spending_escalation_leak",
        "cash_usage_leak",
        "airtime_data_leak",
        "food_spending_leak",
        "transport_spending_leak",
    }
)
_PRESENT = {
    "unchanged": "still_present",
    "materially_changed": "materially_changed",
}
_BASIS = {
    "still_present": (
        "This pattern is still present. Its material signature has not changed."
    ),
    "materially_changed": (
        "This pattern is still present, and its material signature has changed."
    ),
    "no_longer_detected": (
        "This pattern was not detected in the latest analysed statement. "
        "This is not confirmation that it has ended."
    ),
}


@dataclass(frozen=True)
class StatementWindow:
    """Dates on this import, and the latest date already analysed before it."""

    statement_import_id: str
    earliest: date | None
    latest: date | None
    non_duplicate_count: int
    previous_earliest: date | None
    previous_latest: date | None


@dataclass(frozen=True)
class DetectorHistory:
    """The report's existing history gate. This is not a new detector rule."""

    history_sufficient: bool
    findings_availability: str
    transaction_count: int
    earliest: date | None
    latest: date | None


@dataclass(frozen=True)
class FindingOutcomeCheck:
    user_id: str
    finding_id: str
    statement_import_id: str
    outcome: str
    basis: str
    checked_at: datetime
    id: str | None = None


def outcome_checks_for_import(
    *,
    user_id: str,
    existing: Sequence[RegistryRow],
    plan: RegistryPlan,
    window: StatementWindow,
    history: DetectorHistory,
    statement_import_id: str,
    checked_at: datetime,
) -> tuple[FindingOutcomeCheck, ...]:
    """One check for each finding this import can compare with an earlier import."""
    if checked_at.tzinfo is None or checked_at.utcoffset() is None:
        raise RegistryCompositionError("checked_at must be timezone-aware.")
    if window.statement_import_id != statement_import_id:
        raise RegistryCompositionError("Statement window does not match the import.")
    by_identity = {item.row.identity_key: item for item in plan.items}
    checks: list[FindingOutcomeCheck] = []
    for row in existing:
        if row.user_id != user_id:
            raise RegistryScopeError("Outcome check belongs to a different user.")
        if not _needs_check(row, statement_import_id):
            continue
        item = by_identity.get(row.identity_key)
        if item is None or row.id is None:
            continue
        outcome, basis = _outcome(row, item.classification, window, history)
        checks.append(
            FindingOutcomeCheck(
                id=str(uuid4()),
                user_id=user_id,
                finding_id=row.id,
                statement_import_id=statement_import_id,
                outcome=outcome,
                basis=basis,
                checked_at=checked_at,
            )
        )
    return tuple(checks)


def outcome_insert_payload(check: FindingOutcomeCheck) -> dict[str, str]:
    """Fields written for one check. Registry status and user actions are absent."""
    if check.id is None or check.outcome not in OUTCOMES:
        raise RegistryCompositionError("Outcome check is incomplete.")
    if _unsafe_basis(check.basis):
        raise RegistryCompositionError("Outcome basis is not safe to store.")
    return {
        "id": check.id,
        "user_id": check.user_id,
        "finding_id": check.finding_id,
        "statement_import_id": check.statement_import_id,
        "outcome": check.outcome,
        "basis": check.basis,
        "checked_at": check.checked_at.isoformat(),
    }


def _needs_check(row: RegistryRow, statement_import_id: str) -> bool:
    """A retry of the import that last wrote the row is not a new comparison."""
    return bool(
        row.id
        and row.last_statement_import_id
        and row.last_statement_import_id != statement_import_id
    )


def _outcome(
    row: RegistryRow,
    classification: str,
    window: StatementWindow,
    history: DetectorHistory,
) -> tuple[str, str]:
    reason = _insufficient_reason(row, classification, window, history)
    if reason is not None:
        return "insufficient_new_history", reason
    if classification == "not_observed":
        return "no_longer_detected", _BASIS["no_longer_detected"]
    outcome = _PRESENT.get(classification)
    if outcome is None:
        return (
            "insufficient_new_history",
            "This import does not provide a comparison for the stored finding.",
        )
    return outcome, _BASIS[outcome]


def _insufficient_reason(
    row: RegistryRow,
    classification: str,
    window: StatementWindow,
    history: DetectorHistory,
) -> str | None:
    if (
        not history.history_sufficient
        or history.findings_availability == "insufficient_history"
    ):
        return "The analysed history does not meet the minimum used for leak detection."
    if window.non_duplicate_count < 1 or window.latest is None:
        return "The imported statement has no new transactions to compare."
    if window.previous_latest is not None and window.latest <= window.previous_latest:
        return (
            "The imported statement overlaps the previous period and does not "
            "add a later transaction date."
        )
    if classification != "not_observed":
        return None
    if row.leak_type in _TREND and _completed_months(history) < MIN_TREND_MONTHS:
        return (
            "Spending and fee trends need at least 3 completed months before "
            "an absence can be compared."
        )
    if (
        row.leak_type in _RECURRING
        and history.transaction_count < RECURRENCE_MIN_OBSERVATIONS
    ):
        return (
            "Recurring payments need at least 3 observations before an absence "
            "can be compared."
        )
    return None


def _completed_months(history: DetectorHistory) -> int:
    start = history.earliest
    end = history.latest
    if start is None or end is None or end < start:
        return 0
    months = (end.year - start.year) * 12 + (end.month - start.month) + 1
    if end.day < monthrange(end.year, end.month)[1]:
        months -= 1
    return max(months, 0)


def _unsafe_basis(basis: str) -> bool:
    if not basis or len(basis) > 400:
        return True
    return any(char.isdigit() and _digit_run(basis) for char in basis)


def _digit_run(value: str) -> bool:
    run = 0
    for char in value:
        if char.isdigit():
            run += 1
            if run >= 6:
                return True
        else:
            run = 0
    return False
