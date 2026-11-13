"""Regression: statement-import quality gates overall spending period comparisons."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.import_quality import (
    StatementImportQuality,
    classify_import_quality,
    resolve_coverage_observation_bounds,
)
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.periods import completed_months


def _tx(
    transaction_id: str,
    amount: str,
    when: date,
    *,
    statement_id: str | None = "import-a",
    merchant: str = "SHOP",
    category: str = "Groceries",
) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=merchant,
        description=merchant,
        transaction_type="debit",
        statement_id=statement_id,
        categorisation=CategorisationResult(
            category_name=category,
            category_confidence=0.95,
            transaction_class="spending",
            classification_confidence=0.95,
            merchant_name=merchant,
        ),
    )


def _rising_spend(*, statement_id: str = "import-a") -> list[FeatureTransaction]:
    return [
        _tx("a", "100", date(2026, 7, 1), statement_id=statement_id),
        _tx("b", "200", date(2026, 8, 1), statement_id=statement_id),
        _tx("c", "500", date(2026, 9, 30), statement_id=statement_id),
    ]


def _quality(
    import_id: str = "import-a",
    *,
    balance_reconciliation: str | None = "verified",
    rows_detected: int | None = 100,
    rows_rejected: int | None = 0,
    extraction_confidence: str | None = "0.90",
    statement_start_date: date | None = date(2026, 7, 1),
    statement_end_date: date | None = date(2026, 9, 30),
) -> StatementImportQuality:
    return StatementImportQuality(
        import_id=import_id,
        balance_reconciliation=balance_reconciliation,
        rows_detected=rows_detected,
        rows_rejected=rows_rejected,
        extraction_confidence=(
            Decimal(extraction_confidence) if extraction_confidence is not None else None
        ),
        statement_start_date=statement_start_date,
        statement_end_date=statement_end_date,
    )


def _types(transactions, quality=None):
    snapshot = build_financial_features(
        "user-a",
        transactions,
        statement_import_quality=quality,
    )
    return {item.behavior_type for item in analyze_behaviour(snapshot).observations}, snapshot


def test_classify_import_quality_thresholds() -> None:
    assert classify_import_quality(_quality()) == "reliable"
    assert (
        classify_import_quality(_quality(balance_reconciliation="mismatch")) == "unreliable"
    )
    assert (
        classify_import_quality(_quality(rows_detected=100, rows_rejected=20)) == "unreliable"
    )
    assert (
        classify_import_quality(_quality(rows_detected=100, rows_rejected=19)) == "reliable"
    )
    assert (
        classify_import_quality(_quality(extraction_confidence="0.65")) == "reliable"
    )
    assert (
        classify_import_quality(_quality(extraction_confidence="0.649")) == "unreliable"
    )
    assert (
        classify_import_quality(
            StatementImportQuality(import_id="x")
        )
        == "unknown"
    )
    assert (
        classify_import_quality(
            _quality(
                balance_reconciliation=None,
                rows_detected=None,
                rows_rejected=None,
                extraction_confidence=None,
            )
        )
        == "unknown"
    )


def test_clean_import_remains_eligible_for_spending_comparison() -> None:
    types, snapshot = _types(_rising_spend(), [_quality()])
    assert "spending_increase" in types
    assert snapshot.coverage_observation_start == date(2026, 7, 1)
    assert snapshot.coverage_observation_end == date(2026, 9, 30)


def test_balance_mismatch_suppresses_spending_change() -> None:
    types, _ = _types(
        _rising_spend(),
        [_quality(balance_reconciliation="mismatch")],
    )
    assert "spending_increase" not in types
    assert "spending_decrease" not in types


def test_rejection_ratio_at_and_below_threshold() -> None:
    at_threshold, _ = _types(
        _rising_spend(),
        [_quality(rows_detected=100, rows_rejected=20)],
    )
    assert "spending_increase" not in at_threshold

    below, _ = _types(
        _rising_spend(),
        [_quality(rows_detected=100, rows_rejected=19)],
    )
    assert "spending_increase" in below


def test_extraction_confidence_at_and_below_floor() -> None:
    at_floor, _ = _types(
        _rising_spend(),
        [_quality(extraction_confidence="0.65")],
    )
    assert "spending_increase" in at_floor

    below, _ = _types(
        _rising_spend(),
        [_quality(extraction_confidence="0.64")],
    )
    assert "spending_increase" not in below


def test_missing_quality_fields_do_not_suppress() -> None:
    types, _ = _types(
        _rising_spend(),
        [StatementImportQuality(import_id="import-a")],
    )
    assert "spending_increase" in types


def test_poor_quality_outside_comparison_window_does_not_suppress() -> None:
    transactions = [
        *_rising_spend(statement_id="import-good"),
        _tx("old", "50", date(2026, 1, 15), statement_id="import-bad"),
    ]
    qualities = [
        _quality(
            "import-good",
            statement_start_date=date(2026, 7, 1),
            statement_end_date=date(2026, 9, 30),
        ),
        _quality(
            "import-bad",
            balance_reconciliation="mismatch",
            statement_start_date=date(2026, 1, 1),
            statement_end_date=date(2026, 1, 31),
        ),
    ]
    types, snapshot = _types(transactions, qualities)
    # Contiguous suffix for spend is Jul–Sep from import-good only.
    assert "spending_increase" in types
    assert snapshot.import_ids_by_month["2026-07"] == ["import-good"]


def test_declared_dates_reveal_incomplete_trailing_period() -> None:
    transactions = [
        _tx("a", "100", date(2026, 7, 10), statement_id="import-a"),
        _tx("b", "100", date(2026, 8, 10), statement_id="import-a"),
        _tx("c", "100", date(2026, 9, 10), statement_id="import-a"),
        _tx("d", "800", date(2026, 10, 10), statement_id="import-a"),
    ]
    # Txn max is Oct 10; declared end also Oct 10 → October incomplete.
    quality = _quality(
        statement_start_date=date(2026, 7, 1),
        statement_end_date=date(2026, 10, 10),
    )
    snapshot = build_financial_features(
        "user-a", transactions, statement_import_quality=[quality]
    )
    assert snapshot.date_end == date(2026, 10, 10)
    assert snapshot.coverage_observation_end == date(2026, 10, 10)
    months = [month.month for month in completed_months(snapshot)]
    assert months == ["2026-07", "2026-08", "2026-09"]
    types = {item.behavior_type for item in analyze_behaviour(snapshot).observations}
    assert "spending_increase" not in types


def test_declared_opening_date_can_exclude_late_start_month() -> None:
    transactions = [
        _tx("a", "100", date(2026, 7, 5), statement_id="import-a"),
        _tx("b", "100", date(2026, 8, 10), statement_id="import-a"),
        _tx("c", "100", date(2026, 9, 10), statement_id="import-a"),
        _tx("d", "400", date(2026, 10, 31), statement_id="import-a"),
    ]
    # Declared start day 20 makes July incomplete even though first txn is day 5.
    quality = _quality(
        statement_start_date=date(2026, 7, 20),
        statement_end_date=date(2026, 10, 31),
    )
    snapshot = build_financial_features(
        "user-a", transactions, statement_import_quality=[quality]
    )
    assert snapshot.coverage_observation_start == date(2026, 7, 20)
    months = [month.month for month in completed_months(snapshot)]
    assert "2026-07" not in months
    assert months == ["2026-08", "2026-09", "2026-10"]


def test_contradictory_declared_dates_are_ignored() -> None:
    start, end = resolve_coverage_observation_bounds(
        date(2026, 7, 1),
        date(2026, 9, 30),
        [
            StatementImportQuality(
                import_id="bad",
                statement_start_date=date(2026, 9, 30),
                statement_end_date=date(2026, 7, 1),
            )
        ],
    )
    assert start == date(2026, 7, 1)
    assert end == date(2026, 9, 30)


def test_missing_declared_dates_leave_txn_bounds() -> None:
    start, end = resolve_coverage_observation_bounds(
        date(2026, 7, 1),
        date(2026, 9, 26),
        [StatementImportQuality(import_id="x")],
    )
    assert start == date(2026, 7, 1)
    assert end == date(2026, 9, 26)


def test_unreliable_import_does_not_emit_spending_escalation_leak() -> None:
    leaks = detect_leaks(
        build_financial_features(
            "user-a",
            _rising_spend(),
            statement_import_quality=[_quality(balance_reconciliation="mismatch")],
        ),
        analyze_behaviour(
            build_financial_features(
                "user-a",
                _rising_spend(),
                statement_import_quality=[_quality(balance_reconciliation="mismatch")],
            )
        ),
    )
    assert "spending_escalation_leak" not in {item.leak_type for item in leaks.leaks}


def test_unrelated_findings_still_emit_when_spend_trend_gated() -> None:
    # Duplicate same-day pattern is unrelated to period quality gating.
    transactions = [
        *_rising_spend(),
        _tx("dup-1", "50", date(2026, 9, 15), merchant="COFFEE", category="Restaurants"),
        _tx("dup-2", "50", date(2026, 9, 15), merchant="COFFEE", category="Restaurants"),
    ]
    snapshot = build_financial_features(
        "user-a",
        transactions,
        statement_import_quality=[_quality(balance_reconciliation="mismatch")],
    )
    behaviours = analyze_behaviour(snapshot)
    types = {item.behavior_type for item in behaviours.observations}
    assert "spending_increase" not in types
    assert "duplicate_payment_pattern" in types


def test_contiguous_month_and_baseline_protections_still_apply() -> None:
    # Gap months: contiguous suffix too short for spending_increase.
    types, _ = _types(
        [
            _tx("a", "100", date(2026, 8, 10)),
            _tx("b", "500", date(2026, 11, 10)),
            _tx("c", "600", date(2026, 12, 10)),
        ],
        [_quality(statement_start_date=date(2026, 8, 1), statement_end_date=date(2026, 12, 31))],
    )
    assert "spending_increase" not in types

    tiny, _ = _types(
        [
            _tx("a", "10", date(2026, 7, 1)),
            _tx("b", "10", date(2026, 8, 1)),
            _tx("c", "80", date(2026, 9, 30)),
        ],
        [_quality()],
    )
    assert "spending_increase" not in tiny
