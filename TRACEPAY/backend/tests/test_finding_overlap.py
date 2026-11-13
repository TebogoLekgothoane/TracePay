"""P7: findings that rest on the same event are linked and never totalled twice."""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal

from leak_intelligence.finding_overlap import summarise_impact
from leak_intelligence.leak_evidence import attach_supporting_transactions
from tests.test_leak_detection import _detect, _transaction

def _detected(transactions):
    rows = list(transactions)
    return attach_supporting_transactions(_detect(rows), rows)


def _sub(tx_id, amount, when, merchant="NETFLIX", time_of_day=None):
    return _transaction(
        tx_id, amount, when, merchant=merchant, category="Subscriptions", transaction_time=time_of_day
    )


def _by_basis(summary, basis):
    return [item for item in summary.findings if item.basis == basis]


def test_trial_conversion_and_the_subscription_it_became_are_counted_once() -> None:
    rows = [
        _sub("t0", "0", date(2026, 6, 5), "SHOWMAX"),
        _sub("p1", "99", date(2026, 7, 5), "SHOWMAX"),
        _sub("p2", "99", date(2026, 8, 5), "SHOWMAX"),
        _sub("p3", "99", date(2026, 9, 5), "SHOWMAX"),
    ]
    result = _detected(rows)
    summary = summarise_impact(result.leaks)
    trial = _by_basis(summary, "trial_conversion_cost")
    service = _by_basis(summary, "service_cost")
    assert trial and service
    assert any(
        overlap.relation == "trial_conversion_is_part_of_service_cost" for overlap in summary.overlaps
    )
    assert sum(item.counted_in_total for item in trial + service) == 1
    assert summary.recurring_monthly_potential == Decimal("99.00")
    assert summary.recurring_monthly_before_dedupe == Decimal("198.00")
    assert summary.double_counting_prevented == Decimal("99.00")
    # Both findings still exist with their own evidence.
    assert len(result.leaks) >= 2


def test_two_streaming_services_and_their_own_findings_are_not_added_twice() -> None:
    rows = [
        _sub(f"n{i}", "199", date(2026, 6 + i, 3), "NETFLIX") for i in range(4)
    ] + [_sub(f"s{i}", "99", date(2026, 6 + i, 8), "SHOWMAX") for i in range(4)]
    result = _detected(rows)
    summary = summarise_impact(result.leaks)
    types = {leak.leak_type for leak in result.leaks}
    assert "duplicate_streaming_leak" in types
    assert any(overlap.shared_merchants for overlap in summary.overlaps)
    assert summary.recurring_monthly_potential < summary.recurring_monthly_before_dedupe
    assert summary.double_counting_prevented > 0
    # The combined finding stands once; its members are not added on top.
    streaming = next(item for item in summary.findings if item.group_id is not None and item.basis != "service_cost")
    assert streaming.counted_in_total


def test_a_duplicate_charge_inside_a_subscription_is_reported_but_not_netted_away() -> None:
    rows = [_sub(f"s{i}", "199", date(2026, 6 + i, 5), "NETFLIX") for i in range(4)]
    rows += [
        _sub("d1", "199", date(2026, 10, 12), "NETFLIX", time(9, 0)),
        _sub("d2", "199", date(2026, 10, 12), "NETFLIX", time(9, 2)),
    ]
    result = _detected(rows)
    summary = summarise_impact(result.leaks)
    duplicates = _by_basis(summary, "duplicate_extra_charge")
    assert duplicates, "the duplicate charge must still be reported"
    assert duplicates[0].bucket == "one_time"
    assert duplicates[0].counted_in_total
    # A one-time extra charge and a recurring cost are different losses.
    assert summary.one_time_potential == Decimal("199")
    assert summary.one_time_potential == summary.one_time_before_dedupe


def test_findings_that_only_share_a_merchant_are_not_linked() -> None:
    """A rise in a later payment and an early duplicate touch different rows."""
    rows = [
        _sub("a", "199", date(2026, 3, 5), "NETFLIX", time(9, 0)),
        _sub("b", "199", date(2026, 3, 5), "NETFLIX", time(9, 1)),
        _sub("c", "199", date(2026, 4, 5), "NETFLIX"),
        _sub("d", "199", date(2026, 5, 5), "NETFLIX"),
        _sub("e", "199", date(2026, 6, 5), "NETFLIX"),
        _sub("f", "299", date(2026, 7, 5), "NETFLIX"),
        _sub("g", "299", date(2026, 8, 5), "NETFLIX"),
        _sub("h", "299", date(2026, 9, 5), "NETFLIX"),
    ]
    result = _detected(rows)
    summary = summarise_impact(result.leaks)
    rise = _by_basis(summary, "price_increase")
    duplicate = _by_basis(summary, "duplicate_extra_charge")
    if rise and duplicate:
        pair = {rise[0].leak_id, duplicate[0].leak_id}
        assert not any(set(overlap.leak_ids) == pair for overlap in summary.overlaps)
    assert all(item.counted_in_total for item in summary.findings if item.basis in {"price_increase", "duplicate_extra_charge"})


def test_a_price_rise_and_a_service_cost_are_separate_components() -> None:
    rows = [_sub(f"s{i}", amount, date(2026, 4 + i, 5), "NETFLIX") for i, amount in enumerate(["199", "199", "199", "249", "249", "299"])]
    leaks = _detected(rows).leaks
    rise = next(item for item in leaks if item.evidence.get("headline_impact_basis") == "price_increase")
    assert rise.estimated_monthly_impact == Decimal("100.00")
    assert rise.evidence["service_cost_monthly"] == Decimal("299.00")
    summary = summarise_impact(leaks)
    # The summary counts the rise, not the rise plus the service it belongs to.
    assert summary.recurring_monthly_potential == Decimal("100.00")


def test_unrelated_findings_are_added_normally() -> None:
    rows = [_sub(f"n{i}", "199", date(2026, 6 + i, 3), "NETFLIX") for i in range(4)]
    rows += [
        _transaction(
            f"f{i}-{m}", "10", date(2026, m, 2 + i), merchant=None, category="Bank Fees",
            transaction_class="bank_fee", description="IMMEDIATE PAYMENT FEE",
        )
        for m in (6, 7, 8, 9)
        for i in range(6)
    ]
    summary = summarise_impact(_detected(rows).leaks)
    assert summary.overlaps == []
    assert summary.recurring_monthly_potential == summary.recurring_monthly_before_dedupe
    assert summary.double_counting_prevented == 0


def test_observed_history_is_kept_apart_from_projections() -> None:
    rows = [
        _transaction(
            f"i{m}", "212", date(2026, m, 28), merchant=None, category="Bank Fees",
            transaction_class="bank_fee", description="CREDIT CARD INTEREST",
        )
        for m in (6, 7, 8, 9)
    ]
    summary = summarise_impact(_detected(rows).leaks)
    assert summary.observed_total_paid == Decimal("848")
    interest = next(item for item in summary.findings if item.basis == "fees")
    assert interest.observed_amount == Decimal("848")
    assert any("not money lost" in note for note in summary.notes)


def test_findings_without_a_historical_figure_are_listed_not_guessed() -> None:
    rows = [_sub(f"n{i}", "199", date(2026, 6 + i, 3), "NETFLIX") for i in range(4)]
    result = _detected(rows)
    summary = summarise_impact(result.leaks)
    assert summary.observed_total_paid == Decimal("0")
    assert set(summary.findings_without_observed_amount) == {leak.leak_id for leak in result.leaks}


def test_summary_is_deterministic_and_idempotent() -> None:
    rows = [
        _sub("t0", "0", date(2026, 6, 5), "SHOWMAX"),
        _sub("p1", "99", date(2026, 7, 5), "SHOWMAX"),
        _sub("p2", "99", date(2026, 8, 5), "SHOWMAX"),
        _sub("p3", "99", date(2026, 9, 5), "SHOWMAX"),
    ]
    first = summarise_impact(_detected(rows).leaks)
    second = summarise_impact(_detected(list(reversed(rows))).leaks)
    assert first.model_dump() == second.model_dump()


def test_empty_result_has_a_zero_summary() -> None:
    summary = summarise_impact([])
    assert summary.recurring_monthly_potential == 0
    assert summary.overlaps == []
