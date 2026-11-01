"""The 18-customer synthetic benchmark.

The expected findings live in tests/benchmark/customers.py and were written before
the engine was run. A false positive or a miss is not "fixed" by editing them:
KNOWN_FALSE_POSITIVES lists the one the engine still produces, so a new one fails
this test and a fix to the known one makes the test ask for the list to shrink.
"""

from __future__ import annotations

import pytest

from tests.benchmark.customers import build_customers
from tests.benchmark.runner import (
    collect_metrics,
    render_report,
    run_all,
    score_customer,
)

# (customer, leak_type) pairs the engine produces although an analyst would not expect them.
# Empty since milestone 2.1: the spending-escalation finding that repeated a duplicate
# debit order's extra R450 is now recognised as the same event and not reported twice.
KNOWN_FALSE_POSITIVES: set[tuple[str, str]] = set()


@pytest.fixture(scope="module")
def results():
    return run_all()


def test_benchmark_covers_the_fifteen_required_scenarios() -> None:
    customers = build_customers()
    assert len(customers) >= 15
    numbered = {customer.name.split("-")[0] for customer in customers}
    assert {f"{number:02d}" for number in range(1, 16)} <= numbered


def test_every_expected_finding_is_detected(results) -> None:
    missed = [
        (item.customer.name, expected.leak_type, expected.focus)
        for item in results
        for expected in item.false_negatives
    ]
    assert missed == []


def test_no_unexpected_findings_beyond_the_known_ones(results) -> None:
    actual = {
        (item.customer.name, leak.leak_type) for item in results for leak in item.false_positives
    }
    assert actual == KNOWN_FALSE_POSITIVES


def test_precision_and_recall_floor(results) -> None:
    overall, _ = collect_metrics(results)
    assert overall.recall is not None and overall.recall >= 0.95
    assert overall.precision is not None and overall.precision >= 0.90


def test_amounts_totals_and_statuses_match_the_expectation(results) -> None:
    for item in results:
        for match in item.matches:
            assert match.amount_ok is not False, (item.customer.name, match.expected)
            assert match.observed_ok is not False, (item.customer.name, match.expected)
            assert match.status_ok is not False, (item.customer.name, match.expected)
        assert item.total_ok is not False, item.customer.name


def test_overlapping_findings_are_never_totalled_twice(results) -> None:
    assert not [item.customer.name for item in results if item.over_counted]


def test_every_run_is_repeatable(results) -> None:
    assert all(item.idempotent for item in results)


def test_borrowing_costs_in_the_benchmark_are_never_annualised(results) -> None:
    for item in results:
        for leak in item.result.leaks:
            if leak.evidence.get("impact_basis") == "observed_history":
                assert leak.estimated_annual_impact is None


def test_findings_carry_their_source_transactions(results) -> None:
    untraceable = set()
    for item in results:
        known = {tx.transaction_id for tx in item.customer.transactions}
        for leak in item.result.leaks:
            assert {row.transaction_id for row in leak.supporting_transactions} <= known
            if leak.supporting_transaction_count == 0:
                untraceable.add(leak.leak_type)
    assert untraceable == set()


def test_the_report_renders_every_section(results) -> None:
    report = render_report(results)
    for heading in ("## Summary", "## Results by leak category", "## Customers", "Precision", "Recall"):
        assert heading in report


def test_reimporting_the_same_statement_changes_nothing() -> None:
    customer = next(item for item in build_customers() if item.name.startswith("07-"))
    single = [tx for tx in customer.transactions if not tx.is_duplicate]
    from tests.benchmark.runner import run_pipeline

    once = run_pipeline(single)
    twice = score_customer(customer).result
    assert [leak.fingerprint for leak in once.leaks] == [leak.fingerprint for leak in twice.leaks]
    assert [leak.estimated_monthly_impact for leak in once.leaks] == [
        leak.estimated_monthly_impact for leak in twice.leaks
    ]
