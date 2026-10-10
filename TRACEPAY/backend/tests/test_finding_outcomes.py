"""Outcome checks stay separate from detection status and user responses."""

from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from app.finding_registry import reconcile_findings_after_import
from leak_intelligence.finding_diff import (
    RegistryPlan,
    RegistryScopeError,
    build_observation,
    plan_registry_changes,
)
from leak_intelligence.finding_outcomes import (
    OUTCOMES,
    DetectorHistory,
    FindingOutcomeCheck,
    StatementWindow,
    outcome_checks_for_import,
    outcome_insert_payload,
)
from tests.test_finding_registry import (
    IMPORT_ID,
    LATER,
    OTHER,
    USER,
    WHEN,
    _Memory,
    _finding,
    _imports,
    _intelligence,
    _leak,
    _processed,
)

LATER_IMPORT = "55555555-5555-4555-8555-555555555555"
FINDING_ID = "66666666-6666-4666-8666-666666666666"
MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "202610100006_finding_outcome_checks.sql"
)
CHECKED = datetime(2026, 10, 10, 21, 0, tzinfo=timezone.utc)


def test_each_outcome_uses_the_detector_comparison() -> None:
    stored = _stored()
    history = _history()
    window = _extended()
    assert _check(stored, _plan(stored), window, history).outcome == "still_present"
    assert (
        _check(stored, _plan(stored, changed=True), window, history).outcome
        == "materially_changed"
    )
    absent = _check(stored, _plan(stored, present=False), window, history)
    assert absent.outcome == "no_longer_detected"
    assert "not detected" in absent.basis
    assert "saved" not in absent.basis.lower()
    assert "resolved" not in absent.basis.lower()
    assert set(OUTCOMES) == {
        "still_present",
        "no_longer_detected",
        "insufficient_new_history",
        "materially_changed",
    }


def test_insufficient_history_and_overlapping_periods_are_not_absences() -> None:
    stored = _stored(leak_type="spending_escalation_leak")
    short = _history(end=date(2026, 8, 15))
    absent = _plan(stored, present=False)
    assert (
        _check(stored, absent, _extended(), short).outcome == "insufficient_new_history"
    )
    assert "3 completed months" in _check(stored, absent, _extended(), short).basis

    recurring = _stored(leak_type="recurring_payment_leak")
    thin = _history(transaction_count=2)
    assert (
        _check(recurring, _plan(recurring, present=False), _extended(), thin).outcome
        == "insufficient_new_history"
    )

    overlap = _check(
        stored,
        _plan(stored),
        _extended(latest=date(2026, 9, 30), previous_latest=date(2026, 9, 30)),
        _history(),
    )
    assert overlap.outcome == "insufficient_new_history"
    assert "overlaps the previous period" in overlap.basis

    empty = _check(stored, _plan(stored), _extended(count=0, latest=None), _history())
    assert empty.outcome == "insufficient_new_history"
    assert "no new transactions" in empty.basis


def test_duplicate_imports_do_not_create_another_check() -> None:
    stored = _stored()
    plan = _plan(stored, changed=True)
    window = _extended()
    history = _history()
    store: dict[tuple[str, str], FindingOutcomeCheck] = {}
    for _attempt in range(2):
        for check in outcome_checks_for_import(
            user_id=USER,
            existing=(stored,),
            plan=plan,
            window=window,
            history=history,
            statement_import_id=LATER_IMPORT,
            checked_at=CHECKED,
        ):
            store.setdefault((check.finding_id, check.statement_import_id), check)
    assert len(store) == 1
    assert next(iter(store.values())).outcome == "materially_changed"
    replayed = replace(stored, last_statement_import_id=LATER_IMPORT)
    assert (
        outcome_checks_for_import(
            user_id=USER,
            existing=(replayed,),
            plan=_plan(replayed),
            window=window,
            history=history,
            statement_import_id=LATER_IMPORT,
            checked_at=CHECKED,
        )
        == ()
    )


def test_user_actions_do_not_become_outcomes_and_stay_isolated() -> None:
    dismissed = _stored(status="dismissed")
    check = _check(dismissed, _plan(dismissed), _extended(), _history())
    assert check.outcome == "still_present"
    assert dismissed.status == "dismissed"
    assert dismissed.signature_generation == 1
    payload = outcome_insert_payload(check)
    assert "status" not in payload
    assert "action_type" not in payload
    with pytest.raises(RegistryScopeError):
        outcome_checks_for_import(
            user_id=USER,
            existing=(_stored(user_id=OTHER),),
            plan=_plan(dismissed),
            window=_extended(),
            history=_history(),
            statement_import_id=LATER_IMPORT,
            checked_at=CHECKED,
        )


def test_reconciliation_records_one_check_for_a_later_import() -> None:
    memory = _Memory()
    stored: dict[tuple[str, str], FindingOutcomeCheck] = {}
    leak = _leak()
    finding = _finding(leak)
    first = _processed()
    second = _processed(LATER_IMPORT, processed_at=LATER)

    def save_outcomes(user_id: str, _token: str, checks: list[FindingOutcomeCheck]) -> None:
        for check in checks:
            if check.user_id != user_id:
                raise RegistryScopeError("wrong user")
            stored.setdefault((check.finding_id, check.statement_import_id), check)

    def load_window(_user_id: str, _token: str, import_id: str) -> StatementWindow:
        return _extended(import_id=import_id)

    def run(record, when: datetime):
        async def intelligence(user_id: str, _token: str):
            return _intelligence(leak, finding, user_id)

        return asyncio.run(
            reconcile_findings_after_import(
                USER,
                "token",
                record.id,
                load_import=_imports(first, second),
                load_rows=memory.load,
                save_rows=memory.save,
                save_notifications=memory.save_notifications,
                load_window=load_window,
                save_outcomes=save_outcomes,
                run_intelligence=intelligence,
                observed_at=when,
            )
        )

    run(first, WHEN)
    assert stored == {}
    run(second, LATER)
    run(second, datetime(2026, 10, 10, 22, 0, tzinfo=timezone.utc))
    assert len(stored) == 1
    check = next(iter(stored.values()))
    assert check.outcome == "still_present"
    assert check.statement_import_id == LATER_IMPORT
    assert memory.rows[0].status == "open"
    assert memory.rows[0].signature_generation == 1


def test_outcome_migration_is_owner_scoped() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "unique (finding_id, statement_import_id)" in sql
    assert "enable row level security" in sql
    assert "auth.uid()" in sql
    assert "grant select, insert on table public.finding_outcome_checks to authenticated" in sql
    assert "grant update" not in sql
    assert "grant delete" not in sql
    assert "for delete" not in sql
    assert "service_role" not in sql
    assert "references public.finding_registry" in sql
    assert "references public.statement_imports" in sql
    for outcome in OUTCOMES:
        assert f"'{outcome}'" in sql


def _check(row, plan: RegistryPlan, window: StatementWindow, history: DetectorHistory):
    checks = outcome_checks_for_import(
        user_id=USER,
        existing=(row,),
        plan=plan,
        window=window,
        history=history,
        statement_import_id=LATER_IMPORT,
        checked_at=CHECKED,
    )
    assert len(checks) == 1
    return checks[0]


def _plan(existing, *, present: bool = True, changed: bool = False) -> RegistryPlan:
    leak = _changed_leak() if changed else _leak()
    observations = []
    if present:
        observations.append(build_observation(user_id=USER, leak=leak, finding=_finding(leak)))
    return plan_registry_changes(
        user_id=USER,
        existing=(existing,),
        observations=observations,
        statement_import_id=LATER_IMPORT,
        observed_at=LATER,
    )


def _stored(**overrides: object):
    leak = _leak()
    plan = plan_registry_changes(
        user_id=USER,
        existing=(),
        observations=[build_observation(user_id=USER, leak=leak, finding=_finding(leak))],
        statement_import_id=IMPORT_ID,
        observed_at=WHEN,
    )
    return replace(plan.writes[0], id=FINDING_ID, **overrides)


def _changed_leak():
    return _leak(
        estimated_monthly_impact=Decimal("500.00"),
        estimated_annual_impact=Decimal("6000.00"),
        evidence={
            "finding_focus": "sms_banking",
            "sms_fee_total": Decimal("500.00"),
            "completed_month_count": 3,
            "behaviour_confidence": Decimal("0.80"),
        },
    )


def _extended(
    latest: date | None = date(2026, 10, 31),
    previous_latest: date | None = date(2026, 9, 30),
    count: int = 4,
    import_id: str = LATER_IMPORT,
) -> StatementWindow:
    return StatementWindow(
        statement_import_id=import_id,
        earliest=date(2026, 10, 1) if latest is not None else None,
        latest=latest,
        non_duplicate_count=count,
        previous_earliest=date(2026, 7, 1),
        previous_latest=previous_latest,
    )


def _history(
    end: date = date(2026, 9, 30),
    transaction_count: int = 12,
) -> DetectorHistory:
    return DetectorHistory(
        history_sufficient=True,
        findings_availability="available",
        transaction_count=transaction_count,
        earliest=date(2026, 7, 1),
        latest=end,
    )
