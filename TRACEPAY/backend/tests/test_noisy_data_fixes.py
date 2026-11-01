"""Fixes for the three misses the noisy benchmark found, each with its precision guards."""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal

import pytest

from leak_intelligence.engine import (
    _fill_missed_cycles,
    _introductory_amount,
    build_financial_features,
)
from leak_intelligence.finding_diff import observations_from_run
from tests.benchmark.noisy_customers import raw
from tests.test_leak_detection import _detect
from tests.test_new_findings_end_to_end import _full_run
from tests.benchmark.customers import Customer

D = Decimal


def _spotify(months, amount="80"):
    return [raw(f"s{m}", amount, date(2026, m, 9), "SPOTIFY P1A2B3") for m in months]


def _leaks(transactions, leak_type):
    return [item for item in _detect(transactions).leaks if item.leak_type == leak_type]


# ----------------------------------------------------- 1. a missing statement month
def test_a_missing_month_does_not_break_a_monthly_subscription() -> None:
    rows = _spotify((4, 5, 7, 8, 9))
    snapshot = build_financial_features("user-a", rows)
    recurrence = snapshot.merchants[0].recurrence
    assert recurrence.recurrence_strength in {"medium", "high"}
    assert recurrence.missed_cycle_count == 1
    assert recurrence.observation_count == 5  # the real payments are still five
    [leak] = _leaks(rows, "subscription_leak")
    assert leak.estimated_monthly_impact == D("80.00")
    assert leak.evidence["missed_cycle_count"] == 1


def test_a_complete_series_reports_no_missed_cycles() -> None:
    snapshot = build_financial_features("user-a", _spotify((4, 5, 6, 7, 8, 9)))
    assert snapshot.merchants[0].recurrence.missed_cycle_count == 0


def test_filling_needs_the_gap_to_be_a_whole_number_of_cycles() -> None:
    gaps = [D(30), D(61), D(30), D(30)]
    filled, missed = _fill_missed_cycles(gaps)
    assert missed == 1 and len(filled) == 5
    # 45 days is neither one cycle nor two, so nothing is explained away.
    assert _fill_missed_cycles([D(30), D(45), D(30), D(30)]) == ([D(30), D(45), D(30), D(30)], 0)


def test_an_irregular_series_is_not_smoothed_by_filling() -> None:
    # 27, 13 and 51 days: the 51 is nearly two cycles but the 13 is not a cycle at all.
    series = [D(27), D(13), D(51)]
    assert _fill_missed_cycles(series) == (series, 0)


def test_too_many_missing_cycles_means_the_data_is_too_thin() -> None:
    series = [D(30), D(60), D(30), D(60), D(30), D(60)]
    assert _fill_missed_cycles(series) == (series, 0)


def test_non_billing_intervals_are_never_filled() -> None:
    series = [D(2), D(4), D(2), D(2)]  # daily-ish spending, not a bill
    assert _fill_missed_cycles(series) == (series, 0)


def test_the_existing_irregular_gym_debit_order_is_still_not_recurring() -> None:
    days = [date(2026, 7, 1), date(2026, 7, 28), date(2026, 8, 10), date(2026, 9, 30)]
    rows = [raw(f"g{i}", "299", day, "DEBIT ORDER PLANET FITNESS SANDTON") for i, day in enumerate(days)]
    assert not _leaks(rows, "recurring_payment_leak")
    assert not _leaks(rows, "subscription_leak")


# ------------------------------------------------- 2. an introductory first payment
def _showmax(amounts):
    return [raw(f"p{i}", amount, date(2026, 4 + i, 5), "SHOWMAX") for i, amount in enumerate(amounts)]


def test_an_introductory_first_payment_does_not_hide_the_subscription() -> None:
    rows = _showmax(["29", "99", "99", "99", "99"])
    recurrence = build_financial_features("user-a", rows).merchants[0].recurrence
    assert recurrence.introductory_amount == D("29")
    assert recurrence.recurrence_strength in {"medium", "high"}
    [leak] = _leaks(rows, "subscription_leak")
    # The finding is the R99 subscription; the R29 -> R99 step is not a "price rise".
    assert leak.estimated_monthly_impact == D("99.00")
    assert leak.evidence["headline_impact_basis"] == "recurring_cost"
    assert leak.evidence["introductory_amount"] == D("29")
    assert leak.evidence["promotional_start_possible"] is True


@pytest.mark.parametrize(
    "amounts",
    [
        ["150", "199", "199", "199"],  # only 25% lower: a price rise, not an introductory offer
        ["29", "99", "60", "120"],  # what follows is not steady
        ["29", "99", "99"],  # too few payments after the first
        ["99", "99", "99", "29"],  # a low payment at the end is not an introduction
    ],
)
def test_only_a_clear_introductory_offer_is_recognised(amounts) -> None:
    assert _introductory_amount([D(value) for value in amounts]) is None


def test_a_genuine_price_creep_is_unchanged() -> None:
    rows = _showmax(["199", "199", "199", "249", "249", "299"])
    [leak] = _leaks(rows, "subscription_leak")
    assert leak.estimated_monthly_impact == D("100.00")
    assert leak.evidence["headline_impact_basis"] == "price_increase"
    assert "introductory_amount" not in leak.evidence


# --------------------------------------- 3. duplicates at an unrecognised merchant
def _order(tx_id, description="TAKEALOT.COM ORDER 884211", at=time(12, 0), amount="349", day=date(2026, 8, 18)):
    return raw(tx_id, amount, day, description, at=at)


ANCHOR = raw("anchor", "420", date(2026, 9, 30), "CHECKERS HYPER")


def test_the_same_charge_twice_in_a_minute_is_found_without_naming_a_merchant() -> None:
    rows = [_order("a"), _order("b", at=time(12, 1)), ANCHOR]
    [leak] = _leaks(rows, "duplicate_payment_leak")
    assert leak.estimated_monthly_impact == D("349")
    evidence = leak.evidence
    assert evidence["merchant_key"] is None
    assert evidence["description_signature"] == "TAKEALOT COM"
    assert "merchant_display_name" not in evidence
    assert "takealot" not in leak.title.lower()
    assert evidence["evidence_status"] == "possible"
    assert leak.confidence <= 0.70


def test_the_unidentified_duplicate_carries_its_rows_and_its_own_registry_identity() -> None:
    from leak_intelligence.leak_evidence import attach_supporting_transactions

    rows = [_order("a"), _order("b", at=time(12, 1)), ANCHOR]
    detected = attach_supporting_transactions(_detect(rows), rows)
    [leak] = [item for item in detected.leaks if item.leak_type == "duplicate_payment_leak"]
    assert {row.transaction_id for row in leak.supporting_transactions} == {"a", "b"}
    assert leak.evidence["transaction_evidence"] == "attached"

    other = [
        raw("c", "120", date(2026, 8, 20), "KAMOHELO TRADING CC 12", at=time(9, 0)),
        raw("d", "120", date(2026, 8, 20), "KAMOHELO TRADING CC 12", at=time(9, 2)),
    ]
    leaks, report = _full_run(Customer("two-unfamiliar", "two", [*rows, *other], []))
    observations = observations_from_run("user-a", report, leaks)
    duplicates = [item for item in observations if item.leak_type == "duplicate_payment_leak"]
    assert len(duplicates) == 2
    assert len({item.identity_key for item in duplicates}) == 2


@pytest.mark.parametrize(
    "rows",
    [
        # Different order references: two orders, not one charge twice.
        [_order("a"), _order("b", "TAKEALOT.COM ORDER 884377", time(12, 1)), ANCHOR],
        # No times: a date alone is not enough for an unrecognised payee.
        [_order("a", at=None), _order("b", at=None), ANCHOR],
        # Half an hour apart.
        [_order("a"), _order("b", at=time(12, 30)), ANCHOR],
        # Hours apart.
        [_order("a"), _order("b", at=time(18, 0)), ANCHOR],
        # Three charges: a routine, not an accident.
        [_order("a"), _order("b", at=time(12, 1)), _order("c", at=time(12, 2)), ANCHOR],
        # Nothing in the description says who was paid.
        [
            _order("a", "POS PURCHASE 4482"),
            _order("b", "POS PURCHASE 4482", time(12, 1)),
            ANCHOR,
        ],
        # Under the R20 floor.
        [_order("a", amount="15"), _order("b", amount="15", at=time(12, 1)), ANCHOR],
    ],
    ids=["different-orders", "no-times", "30-minutes", "hours-apart", "three", "boilerplate", "tiny"],
)
def test_unrecognised_payee_duplicates_need_tight_evidence(rows) -> None:
    assert not _leaks(rows, "duplicate_payment_leak")


def test_a_recognised_merchant_is_still_handled_as_before() -> None:
    rows = [
        raw("a", "349", date(2026, 8, 18), "WOOLWORTHS CAPE TOWN", at=time(12, 0)),
        raw("b", "349", date(2026, 8, 18), "WOOLWORTHS CAPE TOWN", at=time(12, 1)),
        ANCHOR,
    ]
    [leak] = _leaks(rows, "duplicate_payment_leak")
    assert leak.evidence["merchant_key"] == "WOOLWORTHS"
    assert "description_signature" not in leak.evidence


def test_a_unidentified_debit_order_pair_is_not_read_as_a_duplicate_payment() -> None:
    days = [date(2026, m, 1) for m in (5, 6, 7, 8)]
    rows = [raw(f"d{i}", "450", day, "DEBIT ORDER ZXQ SERVICES 1") for i, day in enumerate(days)]
    rows.append(raw("e", "450", date(2026, 8, 3), "DEBIT ORDER ZXQ SERVICES 1"))
    assert not _leaks(rows, "duplicate_payment_leak")
