"""Every figure a finding states must be traceable to the statement rows behind it."""

from decimal import Decimal

import pytest

from leak_intelligence.statement_review import MAX_EVIDENCE_ROWS, build_statement_review
from tests.statement_review_helpers import investec_context, investec_transactions


@pytest.fixture(scope="module")
def review():
    return build_statement_review(investec_transactions(), investec_context())


@pytest.fixture(scope="module")
def by_key(review):
    return {item.key: item for item in review.findings}


def _total(finding, role=None) -> Decimal:
    return sum((r.amount for r in finding.rows if role is None or r.role == role), Decimal("0"))


def test_the_doubled_debit_lists_every_regular_charge_and_the_double(by_key) -> None:
    finding = by_key["double_debit:Virgin Active"]
    assert [(r.date.isoformat(), r.amount, r.role) for r in finding.rows] == [
        ("2026-06-01", Decimal("835.00"), "regular"),
        ("2026-07-01", Decimal("835.00"), "regular"),
        ("2026-08-01", Decimal("835.00"), "regular"),
        ("2026-09-01", Decimal("835.00"), "regular"),
        ("2026-10-01", Decimal("1670.00"), "doubled"),
    ]


def test_the_repeats_are_exactly_the_rows_that_make_up_the_pairs(by_key) -> None:
    finding = by_key["paired:Apple"]
    assert len(finding.rows) == 12  # 6 pairs of two
    repeats = [r for r in finding.rows if r.role == "repeat"]
    assert len(repeats) == 6
    # The R974.94 the text states is the repeats, not the first charge of each pair.
    assert sum((r.amount for r in repeats), Decimal("0")) == finding.figures["extra"] == Decimal("974.94")


def test_the_interest_rows_add_up_to_the_stated_total(by_key) -> None:
    finding = by_key["overdraft_interest"]
    assert len(finding.rows) == 5
    assert _total(finding) == Decimal("2065.46")


def test_the_fee_rows_add_up_to_the_stated_total_and_split_by_source(by_key) -> None:
    finding = by_key["bank_fees"]
    assert _total(finding) == finding.figures["total"] == Decimal("3842.57")
    assert _total(finding, "service charge") == Decimal("3465.00")
    assert _total(finding, "cross-border fee") == Decimal("291.57")
    assert _total(finding, "payment fee") == Decimal("86.00")
    assert finding.rows_total == len(finding.rows)  # fewer than the cap: nothing is cut


def test_the_delivery_rows_are_the_orders_the_text_counts(by_key) -> None:
    finding = by_key["food_delivery"]
    assert finding.rows_total == 52
    assert _total(finding) == Decimal("9727.68")


def test_a_long_list_is_cut_but_the_count_is_never_hidden(by_key) -> None:
    finding = by_key["opaque_billing:Apple"]
    assert finding.rows_total == 39 and len(finding.rows) == 39
    assert _total(finding) == Decimal("12138.60")
    assert sum(1 for r in finding.rows if r.role == "stopped") == 8


def test_the_cap_keeps_the_oldest_rows_and_reports_how_many_there_are() -> None:
    from leak_intelligence.statement_review import EvidenceRow, ReviewFinding
    from datetime import date, timedelta

    rows = [
        EvidenceRow(f"t{i:03d}", date(2026, 1, 1) + timedelta(days=i), "SHOP", Decimal("1.00"), "debit")
        for i in range(MAX_EVIDENCE_ROWS + 20)
    ]
    finding = ReviewFinding(key="k", group="review", leak_type="x", title="t", display="table", rows=list(reversed(rows)))
    assert finding.rows_total == MAX_EVIDENCE_ROWS + 20
    assert len(finding.rows) == MAX_EVIDENCE_ROWS
    assert finding.rows[0].transaction_id == "t000"  # oldest first, whatever order they came in


def test_the_transfer_rows_show_what_went_out_and_what_came_back(by_key) -> None:
    finding = by_key["round_trip_transfers"]
    out = _total(finding, "out")
    back = _total(finding, "back")
    # Four round-trip months at R17,000 out, plus July's R15,000 that never returned.
    assert out == Decimal("83000.00")
    # Returned per month: R10,000 (Jun), R15,900 (Aug), R27,000 (Sep), R17,000 (Oct).
    assert back == Decimal("69900.00")


def test_the_price_change_rows_split_before_and_after(by_key) -> None:
    finding = by_key["price_rise:Dotsure"]
    assert [r.role for r in finding.rows] == ["before"] * 4 + ["after"]
    assert finding.rows[-1].amount == Decimal("814.34")
    drop = by_key["price_drop:Pineapple"]
    assert drop.rows[-1].role == "after" and drop.rows[-1].amount == Decimal("676.23")


def test_every_amount_stated_in_a_card_or_row_is_backed_by_rows(review) -> None:
    # A finding that states statement figures but lists no rows could not be checked.
    for finding in review.findings:
        if finding.key in {"escalation"}:
            continue  # built from the statement's own summary figure, not from rows
        assert finding.rows, f"{finding.key} states figures but lists no rows"
