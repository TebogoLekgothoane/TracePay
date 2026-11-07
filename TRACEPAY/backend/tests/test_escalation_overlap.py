"""Spending escalation: evidence attribution and overlap with duplicate findings."""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal

from leak_intelligence.engine import build_financial_features
from leak_intelligence.finding_overlap import (
    escalation_increase_ids,
    mark_explained_findings,
    split_for_display,
    summarise_impact,
)
from leak_intelligence.leak_evidence import attach_supporting_transactions
from tests.test_leak_detection import _detect, _transaction


def _run(transactions):
    """The same steps the API takes, stopping before the customer list is trimmed."""
    rows = list(transactions)
    result = mark_explained_findings(attach_supporting_transactions(_detect(rows), rows))
    return result, summarise_impact(result.leaks)


def _of(result, leak_type):
    """Every finding of a type, including any later hidden as explained."""
    return [leak for leak in result.leaks if leak.leak_type == leak_type]


def _gym(day_month_pairs):
    return [
        _transaction(
            f"g{index}", "450", date(2026, month, day), merchant="VIRGIN ACTIVE", category="Health",
            description="DEBIT ORDER VIRGIN ACTIVE",
        )
        for index, (month, day) in enumerate(day_month_pairs)
    ]


# The August collection closes July, so the July comparison is a completed month.
GYM_WITH_JULY_DUPLICATE = _gym([(4, 1), (5, 1), (6, 1), (7, 1), (7, 4), (8, 1)])


# A. The duplicate debit order and the spending increase are the same R450.
def test_a_duplicate_debit_order_and_its_spending_increase_are_one_event() -> None:
    # July's spend is R900 against a R450 baseline: a real R450 increase.
    assert build_financial_features("user-a", GYM_WITH_JULY_DUPLICATE).months[3].total_outflow == Decimal("900")
    result, summary = _run(GYM_WITH_JULY_DUPLICATE)
    duplicate = _of(result, "duplicate_debit_order_leak")[0]
    increase = _of(result, "spending_escalation_leak")[0]
    # Both findings are preserved with their own evidence and status ...
    assert increase.estimated_monthly_impact == Decimal("450.00")
    assert increase.evidence["evidence_status"] == "possible"
    assert duplicate.evidence["evidence_status"] == "possible"
    # ... linked through the transactions they share ...
    assert escalation_increase_ids(increase) <= {row.transaction_id for row in duplicate.supporting_transactions}
    assert increase.evidence["explained_by_leak_ids"] == [duplicate.leak_id]
    assert increase.evidence["explained_amount"] == Decimal("450")
    assert "redundant_for_display" not in duplicate.evidence
    # ... and counted once.
    assert summary.one_time_before_dedupe == Decimal("900.00")
    assert summary.one_time_potential == Decimal("450.00")
    assert summary.double_counting_prevented == Decimal("450.00")
    by_id = {item.leak_id: item for item in summary.findings}
    assert by_id[increase.leak_id].display is False
    assert by_id[increase.leak_id].explained_by == [duplicate.leak_id]
    assert by_id[duplicate.leak_id].display is True
    assert by_id[duplicate.leak_id].counted_in_total is True
    # The customer list drops the explained increase; the result still holds it.
    shown = split_for_display(result)
    assert [leak.leak_type for leak in shown.leaks if leak.leak_type.startswith("spending")] == []
    assert [leak.leak_id for leak in shown.explained_leaks] == [increase.leak_id]


def test_the_link_does_not_depend_on_an_amount_threshold() -> None:
    """R449.67 of increase against a R450 duplicate links exactly like R450 does."""
    rows = _gym([(4, 1), (5, 1), (6, 1), (7, 1), (7, 4), (8, 1)])
    rows[0] = _transaction(
        "g0", "451", date(2026, 4, 1), merchant="VIRGIN ACTIVE", category="Health",
        description="DEBIT ORDER VIRGIN ACTIVE",
    )
    result, _ = _run(rows)
    increase = _of(result, "spending_escalation_leak")[0]
    assert increase.estimated_monthly_impact == Decimal("449.67")
    assert increase.evidence.get("redundant_for_display") is True
    assert increase.evidence["explained_amount"] == Decimal("449.67")


def test_a_partly_explained_increase_keeps_both_findings_and_counts_the_event_once() -> None:
    other = [
        _transaction("c1", "200", date(2026, 7, 10), merchant="CHECKERS", category="Groceries"),
    ]
    result, summary = _run([*GYM_WITH_JULY_DUPLICATE, *other])
    duplicate = _of(result, "duplicate_debit_order_leak")
    escalation = _of(result, "spending_escalation_leak")
    assert duplicate and escalation
    increase = escalation[0]
    assert increase.estimated_monthly_impact == Decimal("650.00")
    # Each finding keeps its own status and evidence.
    assert increase.evidence["evidence_status"] == "possible"
    assert duplicate[0].evidence["evidence_status"] == "possible"
    # The increase is made of the repeated gym collection and the new Checkers purchase.
    shared = escalation_increase_ids(increase)
    assert {row.transaction_id for row in increase.supporting_transactions} >= shared
    assert any(overlap.relation for overlap in summary.overlaps)
    # R450 of the R650 is the duplicate: counted once, so R650 and not R1,100.
    assert summary.one_time_before_dedupe == Decimal("1100.00")
    assert summary.one_time_potential == Decimal("650.00")
    assert summary.double_counting_prevented == Decimal("450.00")
    assert all(item.bucket == "one_time" for item in summary.findings)
    # The increase has a row of its own (the Checkers purchase), so it stays visible.
    assert "redundant_for_display" not in increase.evidence
    assert len(split_for_display(result).leaks) == len(result.leaks)


# B. Genuinely higher purchases stay an independent, traceable finding.
def _baseline_checkers():
    # April-June baseline, an unchanged July, and an August row that closes July.
    return [
        _transaction(f"k{month}", "400", date(2026, month, 5), merchant="CHECKERS", category="Groceries")
        for month in (4, 5, 6, 7, 8)
    ]


# July's extra R600 is four purchases, not one: a single large purchase is not an escalation
# (see _rise_is_one_large_purchase), so the rise has to be broad to be reported.
WOOLWORTHS_IDS = {"w1", "w2", "w3", "w4"}


def _july_woolworths():
    return [
        _transaction(f"w{index + 1}", "150", date(2026, 7, 6 + index * 4), merchant="WOOLWORTHS", category="Shopping")
        for index in range(4)
    ]


def test_b_genuinely_higher_purchases_remain_independently_reportable() -> None:
    rows = [*_baseline_checkers(), *_july_woolworths()]
    result, summary = _run(rows)
    escalation = _of(result, "spending_escalation_leak")
    assert len(escalation) == 1
    leak = escalation[0]
    assert leak.estimated_monthly_impact == Decimal("600.00")
    assert leak.evidence["increase_attribution"] == "merchant_rows"
    assert leak.supporting_transaction_count > 0
    attached = {row.transaction_id for row in leak.supporting_transactions}
    assert attached == WOOLWORTHS_IDS  # unchanged Checkers spending is not attached
    assert escalation_increase_ids(leak) == WOOLWORTHS_IDS
    assert "R600.00" in leak.evidence["increase_calculation"]
    assert summary.overlaps == []
    assert summary.one_time_potential == Decimal("600.00")


# C. A duplicate with no spending increase works as before.
def test_c_a_duplicate_payment_without_a_spending_increase_is_unchanged() -> None:
    rows = [
        _transaction("a", "349", date(2026, 8, 18), merchant="TAKEALOT", category="Shopping",
                     transaction_time=time(12, 0)),
        _transaction("b", "349", date(2026, 8, 18), merchant="TAKEALOT", category="Shopping",
                     transaction_time=time(12, 2)),
        _transaction("g", "420", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    result, summary = _run(rows)
    assert len(_of(result, "duplicate_payment_leak")) == 1
    assert _of(result, "spending_escalation_leak") == []
    assert summary.one_time_potential == Decimal("349")
    assert summary.overlaps == []


# D. Same merchant, different transactions: two separate financial events.
def test_d_same_merchant_but_different_transactions_stay_separate() -> None:
    # A non-essential category: a big grocery shop is never an "unusual transaction".
    rows = [
        _transaction("a", "300", date(2026, 4, 6), merchant="WOOLWORTHS", category="Shopping"),
        _transaction("d1", "300", date(2026, 5, 9), merchant="WOOLWORTHS", category="Shopping",
                     transaction_time=time(11, 0)),
        _transaction("d2", "300", date(2026, 5, 9), merchant="WOOLWORTHS", category="Shopping",
                     transaction_time=time(11, 2)),
        _transaction("c", "300", date(2026, 6, 6), merchant="WOOLWORTHS", category="Shopping"),
        _transaction("big", "900", date(2026, 7, 14), merchant="WOOLWORTHS", category="Shopping"),
        _transaction("aug", "300", date(2026, 8, 5), merchant="WOOLWORTHS", category="Shopping"),
    ]
    result, summary = _run(rows)
    duplicate = _of(result, "duplicate_payment_leak")
    escalation = _of(result, "spending_escalation_leak")
    assert duplicate and escalation
    assert escalation_increase_ids(escalation[0]) == {"big"}
    assert not (
        escalation_increase_ids(escalation[0])
        & {row.transaction_id for row in duplicate[0].supporting_transactions if row.transaction_id in {"d1", "d2"}}
    )
    pair = {duplicate[0].leak_id, escalation[0].leak_id}
    assert not any(set(overlap.leak_ids) == pair for overlap in summary.overlaps)
    # The R900 purchase is also reported as an unusual transaction. That finding and
    # the increase it caused are one event (counted once); the May duplicate is another.
    irregular = _of(result, "irregular_transaction_leak")
    assert irregular and irregular[0].estimated_monthly_impact == Decimal("900")
    assert summary.one_time_potential == Decimal("1200")
    assert summary.double_counting_prevented == Decimal("500")
    counted = {item.leak_id: item.counted_in_total for item in summary.findings}
    assert counted[duplicate[0].leak_id] is True
    assert counted[escalation[0].leak_id] is False


# E. Insufficient evidence: say less, never invent rows.
def test_e_an_increase_that_cannot_be_attributed_carries_no_invented_evidence() -> None:
    # Well-classified rows, but no merchant to tie the increase to.
    unknown = [
        _transaction(f"u{month}", "300", date(2026, month, 12), merchant=None, category="Other",
                     confidence=0.9, description="ZXQ SOMETHING")
        for month in (4, 5, 6)
    ] + [
        _transaction(f"v{index}", "300", date(2026, 7, 3 + index * 6), merchant=None, category="Other",
                     confidence=0.9, description="ZXQ SOMETHING")
        for index in range(3)
    ] + [
        _transaction("closing", "300", date(2026, 8, 3), merchant=None, category="Other",
                     confidence=0.9, description="ZXQ SOMETHING")
    ]
    result, _ = _run(unknown)
    escalation = _of(result, "spending_escalation_leak")
    assert escalation, "the increase must exist for this to test anything"
    for leak in escalation:
        assert leak.evidence["increase_attribution"] == "insufficient"
        assert leak.confidence <= 0.60
        assert leak.supporting_transactions == []
        assert "increase_rows" not in leak.evidence
        assert leak.evidence["evidence_status"] == "possible"


def test_e_unreadable_contributor_figures_attach_nothing() -> None:
    rows = [*_baseline_checkers(), *_july_woolworths()]
    result = _detect(rows)
    leak = _of(result, "spending_escalation_leak")[0]
    broken = leak.model_copy(
        update={
            "evidence": {
                **leak.evidence,
                "top_merchant_contributors": [{"merchant_key": "WOOLWORTHS", "change_amount": "n/a"}],
            }
        }
    )
    attached = attach_supporting_transactions(result.model_copy(update={"leaks": [broken]}), rows)
    assert attached.leaks[0].supporting_transactions == []
    assert escalation_increase_ids(attached.leaks[0]) == set()
