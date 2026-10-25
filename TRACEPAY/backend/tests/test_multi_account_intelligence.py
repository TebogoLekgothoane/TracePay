"""Coverage, and Financial Intelligence over consolidated multi-account data."""

from __future__ import annotations

import random
from datetime import date
from decimal import Decimal

import pytest

from leak_intelligence.adapters import FeatureRowValidationError, feature_transaction_from_row
from leak_intelligence.consolidation import consolidate
from leak_intelligence.coverage import coverage_limits_for_range, statement_record_from_row
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_context import assess_account_pattern
from tests.multi_account_helpers import (
    CAPITEC,
    IDENTITIES,
    STANDARD,
    TYME,
    USER,
    analyse,
    coverage_of,
    row,
    statement,
    transactions,
)


def _leaks(result, leak_type):
    return [item for item in result.leaks if item.leak_type == leak_type]


def _stable(result):
    """Everything identifying a finding, ignoring the detection timestamp."""
    return sorted(
        (item.leak_type, item.fingerprint, item.leak_id, item.confidence, str(item.estimated_monthly_impact))
        for item in result.leaks
    )


# -------------------------------------------------------------------------- coverage


def test_consecutive_statements_cover_without_gap() -> None:
    coverage = coverage_of(
        statement("a", CAPITEC, "2026-01-01", "2026-01-31", opening=0, closing=100),
        statement("b", CAPITEC, "2026-02-01", "2026-02-28", opening=100, closing=250),
        statement("c", CAPITEC, "2026-03-01", "2026-03-31", opening=250, closing=300),
    )
    account = next(item for item in coverage.accounts if item.account_id == CAPITEC)
    assert account.gaps == [] and account.overlaps == []
    assert account.covered_ranges == [(date(2026, 1, 1), date(2026, 3, 31))]
    assert coverage.total_statements == 3


def test_overlapping_statements_are_reported_and_merged() -> None:
    coverage = coverage_of(
        statement("a", CAPITEC, "2026-01-01", "2026-02-15"),
        statement("b", CAPITEC, "2026-02-01", "2026-03-31"),
    )
    account = coverage.accounts[0] if coverage.accounts[0].account_id == CAPITEC else coverage.accounts[1]
    assert account.covered_ranges == [(date(2026, 1, 1), date(2026, 3, 31))]
    assert len(account.overlaps) == 1
    assert (account.overlaps[0].start, account.overlaps[0].end) == (date(2026, 2, 1), date(2026, 2, 15))


def test_a_missing_period_with_no_balances_is_not_uploaded_not_proven_missing() -> None:
    coverage = coverage_of(
        statement("a", CAPITEC, "2026-01-01", "2026-01-31"),
        statement("c", CAPITEC, "2026-03-01", "2026-03-31"),
    )
    gap = next(a for a in coverage.accounts if a.account_id == CAPITEC).gaps[0]
    assert (gap.start, gap.end, gap.days) == (date(2026, 2, 1), date(2026, 2, 28), 28)
    assert gap.kind == "not_uploaded"
    assert "unknown" in gap.message


def test_a_gap_is_confirmed_missing_only_when_the_balances_prove_it() -> None:
    proven = coverage_of(
        statement("a", CAPITEC, "2026-01-01", "2026-01-31", opening=0, closing=1000),
        statement("c", CAPITEC, "2026-03-01", "2026-03-31", opening=1800, closing=2000),
    )
    gap = next(a for a in proven.accounts if a.account_id == CAPITEC).gaps[0]
    assert gap.kind == "confirmed_missing"
    assert gap.balance_difference == Decimal("800")

    continuous = coverage_of(
        statement("a", CAPITEC, "2026-01-01", "2026-01-31", opening=0, closing=1000),
        statement("c", CAPITEC, "2026-03-01", "2026-03-31", opening=1000, closing=2000),
    )
    assert next(a for a in continuous.accounts if a.account_id == CAPITEC).gaps[0].kind == "balances_continuous"


def test_coverage_is_per_account() -> None:
    coverage = coverage_of(
        statement("a", CAPITEC, "2026-01-01", "2026-03-31"),
        statement("s", STANDARD, "2026-02-01", "2026-02-28"),
    )
    by_id = {a.account_id: a for a in coverage.accounts}
    assert by_id[CAPITEC].covered_ranges == [(date(2026, 1, 1), date(2026, 3, 31))]
    assert by_id[STANDARD].covered_ranges == [(date(2026, 2, 1), date(2026, 2, 28))]
    assert not by_id[TYME].has_statements
    assert any("TymeBank" in line for line in coverage.summary)
    assert coverage.overall_start == date(2026, 1, 1) and coverage.overall_end == date(2026, 3, 31)


def test_incomplete_or_misread_statements_are_flagged_not_trusted() -> None:
    coverage = coverage_of(
        statement(
            "m", CAPITEC, "2026-01-01", "2026-01-31",
            opening_closing_reconciliation="mismatch", reconciliation_difference=Decimal("-450"),
        ),
        statement("r", STANDARD, "2026-01-01", "2026-01-31", rows_detected=20, rows_rejected=8),
        statement("f", TYME, None, None, status="failed"),
        statement("x", CAPITEC, "2026-04-01", "2026-03-01"),
        statement("o", CAPITEC, "2026-05-01", "2026-05-31", transactions_outside_period=3),
    )
    kinds = {(issue.statement_id, issue.kind) for a in coverage.accounts for issue in a.issues}
    assert ("m", "opening_closing_mismatch") in kinds
    assert ("r", "rows_rejected") in kinds
    assert ("f", "failed") in kinds
    assert ("x", "period_inconsistent") in kinds
    assert ("o", "transactions_outside_period") in kinds
    capitec = next(a for a in coverage.accounts if a.account_id == CAPITEC)
    assert all(p.statement_id != "x" for p in capitec.periods), "a contradictory period covers nothing"
    assert coverage.failed_statements == 1


def test_a_period_inferred_from_transactions_only_vouches_for_those_days() -> None:
    coverage = coverage_of(
        statement(
            "i", CAPITEC, "2026-01-01", "2026-01-31", period_source="inferred",
            first_transaction_date=date(2026, 1, 6), last_transaction_date=date(2026, 1, 28),
        ),
    )
    account = next(a for a in coverage.accounts if a.account_id == CAPITEC)
    assert account.covered_ranges == [(date(2026, 1, 6), date(2026, 1, 28))]
    assert any(issue.kind == "period_inferred" for issue in account.issues)


def test_legacy_period_matching_first_and_last_transaction_is_treated_as_inferred() -> None:
    record = statement_record_from_row(
        {
            "id": "legacy", "account_id": CAPITEC, "status": "processed",
            "statement_start_date": "2026-01-06", "statement_end_date": "2026-01-28",
        },
        first_transaction=date(2026, 1, 6), last_transaction=date(2026, 1, 28),
    )
    assert record is not None
    coverage = coverage_of(record)
    assert next(a for a in coverage.accounts if a.account_id == CAPITEC).periods[0].period_source == "inferred"


def test_coverage_limits_name_the_gap_and_the_missing_accounts() -> None:
    coverage = coverage_of(
        statement("a", CAPITEC, "2026-01-01", "2026-01-31", opening=0, closing=1000),
        statement("c", CAPITEC, "2026-03-01", "2026-03-31", opening=1800, closing=2000),
    )
    limits = coverage_limits_for_range(coverage, {CAPITEC}, date(2026, 1, 10), date(2026, 3, 20))
    kinds = {limit.kind for limit in limits}
    assert "confirmed_missing" in kinds
    assert "account_without_statements" in kinds
    assert next(item for item in limits if item.kind == "account_without_statements").materially_limits is False
    outside = coverage_limits_for_range(coverage, {CAPITEC}, date(2026, 3, 5), date(2026, 3, 20))
    assert "confirmed_missing" not in {limit.kind for limit in outside}


def test_the_disclaimer_says_activity_outside_uploads_cannot_be_detected() -> None:
    assert "cannot be detected" in coverage_of().disclaimer


# --------------------------------------------------------------------- subscriptions


def _netflix(when: str, account: str, amount: str = "-199", **extra):
    return row(when, "DEBIT ORDER NETFLIX.COM", amount, account=account, merchant="NETFLIX", category="Subscriptions", **extra)


def test_a_subscription_that_moves_between_accounts_is_one_series() -> None:
    rows = [
        _netflix("2026-04-01", CAPITEC), _netflix("2026-05-01", CAPITEC), _netflix("2026-06-01", CAPITEC),
        _netflix("2026-07-01", STANDARD), _netflix("2026-08-01", STANDARD), _netflix("2026-09-01", STANDARD),
    ]
    result, _, items = analyse(rows)
    snapshot = build_financial_features(USER, items)
    netflix = next(m for m in snapshot.merchants if m.merchant_name.lower() == "netflix")
    assert netflix.merchant_transaction_count == 6
    assert sorted(netflix.account_ids) == [CAPITEC, STANDARD]
    assert netflix.recurrence.median_interval_days == Decimal("31")

    series = [leak for leak in result.leaks if leak.analysis and leak.analysis.cross_account]
    assert series, "the cross-account series is reported with its accounts"
    context = next(item for item in series if item.leak_type == "subscription_leak").analysis
    assert context.account_pattern == "sequential_move"
    assert {account.label for account in context.source_accounts} == {"Capitec ••1111", "Standard Bank ••2222"}
    assert (context.date_range_start, context.date_range_end) == (date(2026, 4, 1), date(2026, 9, 1))


def _monthly_with_extra_on_other_account():
    rows = [_netflix(f"2026-0{month}-01", CAPITEC) for month in (4, 5, 6, 7, 8)]
    rows.append(_netflix("2026-07-03", STANDARD))
    return rows


def test_an_extra_charge_on_another_account_in_one_cycle_is_a_cross_account_duplicate() -> None:
    result, _, _ = analyse(_monthly_with_extra_on_other_account())
    duplicates = _leaks(result, "duplicate_debit_order_leak")
    assert duplicates, "a second account charged the same merchant inside one billing cycle"
    context = duplicates[0].analysis
    assert context.cross_account is True
    assert context.account_pattern == "concurrent_charges"
    assert context.amount_status == "potentially_duplicated"
    assert context.amount == Decimal("199")
    assert {account.label for account in context.source_accounts} == {"Capitec ••1111", "Standard Bank ••2222"}
    assert duplicates[0].evidence["verification_required"] is True


def test_charges_two_days_apart_on_two_accounts_every_month_are_flagged_as_concurrent() -> None:
    rows = []
    for month in ("2026-04", "2026-05", "2026-06", "2026-07"):
        rows.append(_netflix(f"{month}-01", CAPITEC))
        rows.append(_netflix(f"{month}-03", STANDARD))
    result, _, _ = analyse(rows)
    assert result.leaks, "the merchant is still reported"
    assert all(
        leak.analysis.account_pattern == "concurrent_charges"
        for leak in result.leaks
        if leak.analysis.cross_account
    ), "the context says two accounts are being charged, so it is not read as one clean series"


def test_same_day_charges_on_different_accounts_are_real_duplicates_not_statement_overlap() -> None:
    rows = [_netflix(f"2026-0{month}-01", CAPITEC, statement="s-cap") for month in (4, 5, 6)]
    rows += [_netflix("2026-07-01", CAPITEC, statement="s-cap"), _netflix("2026-07-01", STANDARD, statement="s-std")]
    result, _, _ = analyse(rows)
    assert _leaks(result, "duplicate_debit_order_leak")


def test_same_row_printed_by_two_statements_of_one_account_is_still_treated_as_overlap() -> None:
    rows = [_netflix(f"2026-0{month}-01", CAPITEC, statement="s-1") for month in (4, 5, 6)]
    rows += [_netflix("2026-07-01", CAPITEC, statement="s-1"), _netflix("2026-07-01", CAPITEC, statement="s-2")]
    result, _, _ = analyse(rows)
    assert not _leaks(result, "duplicate_debit_order_leak")


def test_charges_on_unrelated_accounts_are_not_forced_into_one_series() -> None:
    rows = [
        _netflix("2026-04-01", CAPITEC), _netflix("2026-04-20", STANDARD),
        _netflix("2026-07-14", CAPITEC), _netflix("2026-07-30", STANDARD),
    ]
    items = transactions(rows)
    assert assess_account_pattern(items) in {"unrelated_accounts", "concurrent_charges"}
    only_one = transactions([_netflix("2026-04-01", CAPITEC), _netflix("2026-05-01", CAPITEC)])
    assert assess_account_pattern(only_one) == "single_account"


# ------------------------------------------------------------- price increase, order


def _price_rows():
    return [
        _netflix("2026-04-01", STANDARD, "-199", statement="stmt-apr"),
        _netflix("2026-05-01", STANDARD, "-199", statement="stmt-may"),
        _netflix("2026-06-01", CAPITEC, "-199", statement="stmt-jun"),
        _netflix("2026-07-01", CAPITEC, "-249", statement="stmt-jul"),
        _netflix("2026-08-01", CAPITEC, "-249", statement="stmt-aug"),
    ]


def test_a_price_increase_is_found_from_dates_even_when_statements_arrive_out_of_order() -> None:
    ordered_result, _, ordered_items = analyse(_price_rows())
    snapshot = build_financial_features(USER, ordered_items)
    trend = next(m for m in snapshot.merchants if "netflix" in m.merchant_name.lower()).merchant_amount_trend
    assert trend is not None
    assert trend.latest_amount == Decimal("249")
    assert trend.first_amount == Decimal("199")
    assert trend.amount_change > 0

    for seed in range(5):
        rows = _price_rows()
        random.Random(seed).shuffle(rows)
        shuffled_result, _, shuffled_items = analyse(rows)
        assert _stable(shuffled_result) == _stable(ordered_result)
        shuffled_trend = next(
            m for m in build_financial_features(USER, shuffled_items).merchants
            if "netflix" in m.merchant_name.lower()
        ).merchant_amount_trend
        assert shuffled_trend == trend


def test_the_latest_price_is_the_latest_by_date_not_by_extraction_position() -> None:
    rows = list(reversed(_price_rows()))
    _, _, items = analyse(rows)
    merchant = next(
        m for m in build_financial_features(USER, items).merchants if "netflix" in m.merchant_name.lower()
    )
    assert merchant.merchant_amount_trend.latest_amount == Decimal("249")
    assert merchant.merchant_last_transaction_date == date(2026, 8, 1)
    assert merchant.last_account_id == CAPITEC


# ------------------------------------------------------------ missing expected charges


def _gym(when: str, account: str):
    return row(when, "DEBIT ORDER VIRGIN ACTIVE", "-650", account=account, merchant="VIRGIN ACTIVE", category="Fitness")


def test_a_missing_charge_is_not_reported_when_that_account_has_no_later_statements() -> None:
    rows = [_gym(f"2026-0{month}-05", STANDARD) for month in (1, 2, 3, 4, 5, 6)]
    # Another account's statements run to the end of the year.
    rows += [row(f"2026-{month:02d}-10", "CHECKERS", "-300", account=CAPITEC, merchant="CHECKERS", category="Groceries") for month in range(1, 13)]

    unaware, _, _ = analyse(rows)
    assert _leaks(unaware, "inactive_recurring_payment_leak"), "baseline: absence is flagged without coverage"

    coverage = coverage_of(
        statement("std", STANDARD, "2026-01-01", "2026-06-30"),
        statement("cap", CAPITEC, "2026-01-01", "2026-12-31"),
    )
    aware, _, _ = analyse(rows, coverage=coverage)
    assert not _leaks(aware, "inactive_recurring_payment_leak"), (
        "Standard Bank was only covered to 30 June, so nothing can be said about July onward"
    )


def test_a_missing_charge_is_reported_when_its_account_is_covered_past_the_expected_date() -> None:
    rows = [_gym(f"2026-0{month}-05", STANDARD) for month in (1, 2, 3, 4, 5, 6)]
    rows += [row(f"2026-{month:02d}-12", "CHECKERS", "-90", account=STANDARD, merchant="CHECKERS", category="Groceries") for month in range(7, 13)]
    coverage = coverage_of(statement("std", STANDARD, "2026-01-01", "2026-12-31"))
    result, _, _ = analyse(rows, coverage=coverage)
    finding = _leaks(result, "inactive_recurring_payment_leak")
    assert finding
    assert finding[0].analysis.amount_status == "estimated"
    assert finding[0].evidence["not_proof_of_cancellation"] is True


# ----------------------------------------------------------- unknown, duplicates, repeats


def test_an_unknown_merchant_with_a_valid_date_stays_unknown_and_produces_no_leak() -> None:
    rows = [row("2026-04-09", "XYZZY HOLDINGS 4471", "-321.10", klass="unknown")]
    result, view, items = analyse(rows)
    assert items[0].categorisation.transaction_class == "unknown"
    assert items[0].categorisation.category_name is None
    assert items[0].transaction_date == date(2026, 4, 9)
    assert result.leaks == []
    assert view.totals["ZAR"].spending == Decimal("321.10")


def test_two_genuine_payments_to_one_merchant_on_one_day_are_both_counted() -> None:
    rows = [
        row("2026-02-03", "CARD PURCHASE VIDA E CAFFE", "-42", merchant="VIDA E CAFFE", category="Coffee", source_row=1),
        row("2026-02-03", "CARD PURCHASE VIDA E CAFFE", "-42", merchant="VIDA E CAFFE", category="Coffee", source_row=2),
    ]
    _, view, items = analyse(rows)
    assert len(items) == 2
    assert view.totals["ZAR"].spending == Decimal("84")
    assert view.totals["ZAR"].excluded_duplicate_count == 0


def test_reprocessing_the_same_statements_yields_the_same_findings() -> None:
    rows = _price_rows() + [
        row("2026-04-10", "TAKEALOT", "-500", account=CAPITEC, merchant="TAKEALOT", category="Shopping"),
    ]
    first, _, _ = analyse(rows)

    # A reprocessed or overlapping statement re-delivers every row; the import
    # keeps them but marks them duplicates, so analysis must ignore them.
    reprocessed = rows + [
        {**item, "id": f"{item['id']}-again", "statement_id": f"{item['statement_id']}-v2", "is_duplicate": True}
        for item in rows
    ]
    second, view, _ = analyse(reprocessed)
    assert _stable(second) == _stable(first)
    assert view.totals["ZAR"].excluded_duplicate_count == len(rows)
    assert len({leak.fingerprint for leak in second.leaks}) == len(second.leaks)
    assert second.analysis_summary.non_overlapping_amount_by_currency == first.analysis_summary.non_overlapping_amount_by_currency


def test_findings_resting_on_the_same_transactions_are_related_and_counted_once() -> None:
    base, _, items = analyse(_monthly_with_extra_on_other_account())
    duplicate = _leaks(base, "duplicate_debit_order_leak")[0]
    # A second rule reporting on the very same merchant rows (as a subscription
    # review would) plus an unrelated finding on other rows.
    sibling = duplicate.model_copy(
        update={
            "leak_id": "s" * 32, "fingerprint": "s" * 32, "leak_type": "subscription_leak",
            "analysis": None,
        }
    )
    unrelated = duplicate.model_copy(
        update={
            "leak_id": "u" * 32, "fingerprint": "u" * 32, "leak_type": "bank_fee_leak",
            "analysis": None, "supporting_transactions": duplicate.supporting_transactions[:0],
            "supporting_transaction_count": 0,
        }
    )
    from leak_intelligence.leak_context import enrich_leaks
    from tests.multi_account_helpers import ACCOUNT_RECORDS

    result = enrich_leaks(
        base.model_copy(update={"leaks": [duplicate.model_copy(update={"analysis": None}), sibling, unrelated]}),
        items,
        accounts=ACCOUNT_RECORDS,
    )
    by_id = {leak.leak_id: leak for leak in result.leaks}
    first, second = by_id[duplicate.leak_id], by_id["s" * 32]
    assert second.leak_id in first.analysis.overlaps_with
    assert first.leak_id in second.analysis.overlaps_with
    assert by_id["u" * 32].analysis.overlaps_with == []

    counted = [leak for leak in result.leaks if leak.analysis.counted_in_total]
    skipped = [leak for leak in result.leaks if not leak.analysis.counted_in_total]
    assert len(skipped) == 1, "exactly one of the two findings on the same rows is added to the total"
    assert "already part of a larger finding" in " ".join(skipped[0].analysis.confidence_notes)
    assert result.analysis_summary.non_overlapping_amount_by_currency["ZAR"] == sum(
        (leak.analysis.amount for leak in counted), Decimal("0")
    )


# ------------------------------------------------------------------- finding context


def _gapped_coverage():
    return coverage_of(
        statement("a", STANDARD, "2026-04-01", "2026-05-15", opening=0, closing=100),
        statement("b", STANDARD, "2026-05-20", "2026-08-31", opening=900, closing=1000),
    )


def _monthly_standard():
    return [_netflix(f"2026-0{m}-01", STANDARD) for m in (4, 5, 6, 7, 8)]


def test_every_finding_carries_accounts_range_amount_status_calculation_and_limits() -> None:
    result, _, _ = analyse(_monthly_standard(), coverage=_gapped_coverage())
    assert result.leaks
    for leak in result.leaks:
        context = leak.analysis
        assert context is not None
        assert context.source_accounts and context.date_range_start and context.date_range_end
        assert context.currency == "ZAR"
        assert context.amount_status in {"confirmed", "estimated", "potentially_duplicated"}
        assert context.calculation and context.window_rule
        assert context.confidence_level in {"high", "medium", "low"}
        assert any(limit.kind == "confirmed_missing" for limit in context.coverage_limits)
        assert "Missing or unreliable statement coverage" in " ".join(context.confidence_notes)
    assert result.analysis_summary.disclaimer


def test_coverage_limits_lower_the_confidence_level_without_changing_the_detection() -> None:
    plain, _, _ = analyse(_monthly_standard())
    limited, _, _ = analyse(_monthly_standard(), coverage=_gapped_coverage())
    assert _stable(plain) == _stable(limited), "detection itself is unchanged"
    order = {"low": 0, "medium": 1, "high": 2}
    pairs = list(
        zip(sorted(plain.leaks, key=lambda item: item.leak_id), sorted(limited.leaks, key=lambda item: item.leak_id))
    )
    assert pairs
    assert all(order[after.analysis.confidence_level] <= order[before.analysis.confidence_level] for before, after in pairs)
    assert any(order[after.analysis.confidence_level] < order[before.analysis.confidence_level] for before, after in pairs)


def test_existing_leak_contracts_are_unchanged() -> None:
    result, _, _ = analyse(_price_rows())
    payload = result.model_dump(mode="json")
    for leak in payload["leaks"]:
        for key in (
            "leak_id", "fingerprint", "leak_type", "title", "description", "severity", "confidence",
            "status", "estimated_monthly_impact", "estimated_annual_impact", "impact_kind", "evidence",
            "supporting_transactions", "supporting_transaction_count", "detector_version", "detected_at",
        ):
            assert key in leak


# ------------------------------------------------------------------------ isolation


def test_rows_from_another_user_are_rejected_before_consolidation() -> None:
    with pytest.raises(FeatureRowValidationError):
        feature_transaction_from_row({**row("2026-04-01", "X", "-1"), "user_id": "user-b"}, expected_user_id=USER)


def test_consolidating_two_users_together_is_refused_by_the_engine() -> None:
    mine = transactions([row("2026-04-01", "X", "-1")])
    other = transactions([{**row("2026-04-02", "Y", "-1"), "user_id": USER}])
    foreign = other[0].__class__(**{**other[0].__dict__, "user_id": "user-b"})
    view = consolidate([*mine, foreign], IDENTITIES)
    with pytest.raises(ValueError, match="multiple users"):
        build_financial_features(USER, view.transactions)
