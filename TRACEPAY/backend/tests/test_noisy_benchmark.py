"""The noisy benchmark: raw descriptions through the real classifier.

This suite exists because the tidy 18-customer benchmark hands the engine
pre-categorised rows and cannot show classification or recurrence weaknesses.
The sets below record what the engine currently gets wrong, with the cause, so
the test fails if a result changes in either direction: a fix must shrink the
list, and a regression cannot hide in it.
"""

from __future__ import annotations

import pytest

from tests.benchmark.noisy_customers import build_noisy_customers
from tests.benchmark.runner import collect_metrics, run_noisy

# Findings an analyst expects that the engine does not produce, and why.
# The first run missed three (a missing statement month, an introductory first payment,
# and a duplicate at an unrecognised merchant). All three were fixed in the engine with
# the expectations untouched, so nothing is missed now.
KNOWN_MISSED: set[tuple[str, str]] = set()
# Findings produced although an analyst would not expect them, and why.
KNOWN_FALSE_POSITIVES = {
    # N10's amounts rise every month (fuel +31% over the period). The materiality
    # evaluation (milestone 3.1) removed the restaurant finding (+R72.50, under the R100
    # floor) but keeps this one on purpose: fuel is essential spending, the rise is R102.50
    # a month (14.4%) and it has held for several consecutive months. It is a sustained
    # change worth a look, so the rules keep it; the customer is kept as written and is
    # not a clean false-positive measure.
    ("N10-ordinary-spending", "transport_spending_leak"),
}


@pytest.fixture(scope="module")
def results():
    return run_noisy()


def test_the_noisy_suite_covers_the_requested_conditions() -> None:
    names = " ".join(customer.name for customer in build_noisy_customers())
    for condition in ("descriptors", "missing-month", "two-accounts", "unfamiliar", "fee-wordings", "stationary"):
        assert condition in names


def test_rows_are_raw_so_the_classifier_is_part_of_the_test() -> None:
    for customer in build_noisy_customers():
        for item in customer.transactions:
            assert item.categorisation.rule != "synthetic-intelligence-dataset"
            assert item.description  # nothing is pre-labelled by a merchant field alone


def test_missed_findings_are_exactly_the_known_ones(results) -> None:
    missed = {
        (item.customer.name, expected.leak_type) for item in results for expected in item.false_negatives
    }
    assert missed == KNOWN_MISSED


def test_unexpected_findings_are_exactly_the_known_ones(results) -> None:
    unexpected = {
        (item.customer.name, leak.leak_type) for item in results for leak in item.false_positives
    }
    assert unexpected == KNOWN_FALSE_POSITIVES


def test_what_the_engine_gets_right_stays_right(results) -> None:
    right = {(item.customer.name, match.expected.leak_type) for item in results for match in item.matches}
    assert right == {
        ("N01-noisy-subscription-descriptors", "subscription_leak"),
        ("N02-missing-month", "subscription_leak"),
        ("N03-two-accounts", "subscription_leak"),
        ("N04-unfamiliar-merchant", "unknown_recurring_payment"),
        ("N06-same-order-charged-twice", "duplicate_payment_leak"),
        ("N07-promotional-price-ends", "subscription_leak"),
        ("N09-fee-wordings", "bank_fee_leak"),
    }
    for item in results:
        for match in item.matches:
            assert match.amount_ok is not False, (item.customer.name, match.expected)


def test_clean_noisy_customers_produce_nothing(results) -> None:
    for name in ("N05-two-orders-same-day", "N08-reversed-and-repurchased", "N11-stationary-spending"):
        item = next(entry for entry in results if entry.customer.name == name)
        assert item.result.leaks == [], name


def test_noisy_runs_are_repeatable(results) -> None:
    assert all(item.idempotent for item in results)


def test_noisy_metrics_are_reported_not_hidden(results) -> None:
    overall, _ = collect_metrics(results)
    assert (overall.true_positives, overall.false_positives, overall.false_negatives) == (7, 1, 0)
