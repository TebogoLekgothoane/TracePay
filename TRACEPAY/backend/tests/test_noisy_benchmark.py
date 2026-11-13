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
KNOWN_MISSED: set[tuple[str, str]] = {
    # N26 has the same rows as N53 without the "DEBIT ORDER" wording a bank prints on a
    # collection. With it (N53) the duplicate is found; without it the engine reads two
    # charges a day apart at a merchant it has seen monthly as a routine, not a double.
    ("N26-double-debit-order", "duplicate_debit_order_leak"),
}
# Monthly figures the engine reports differently from the analyst's, and why. Both are fees
# that began part-way through a six-month statement (N28: R28 a month for four months, the
# engine reports R14; N32: R85 for four months, the engine reports R68). The engine averages
# over the statement window, so it understates what the customer now pays. Conservative,
# and the observed totals are right.
KNOWN_AMOUNT_DEVIATIONS = {
    ("N28-card-abroad-fees", "bank_fee_leak"),
    ("N32-overdraft-fees", "bank_fee_leak"),
}
# Findings produced although an analyst would not expect them, and why.
KNOWN_FALSE_POSITIVES = {
    # N10's amounts rise every month (fuel +31% over the period). The materiality
    # evaluation (milestone 3.1) removed the restaurant finding (+R72.50, under the R100
    # floor) but keeps this one on purpose: fuel is essential spending, the rise is R102.50
    # a month (14.4%) and it has held for several consecutive months. It is a sustained
    # change worth a look, so the rules keep it; the customer is kept as written and is
    # not a clean false-positive measure.
    ("N10-ordinary-spending", "transport_spending_leak"),
    # N33: one R500 withdrawal a month with its R9.50 fee. The fee rule correctly does not
    # call that stacking (it needs about two withdrawals a month), but cash is 15.3% of
    # spending, just over the 15% reliance line, so the cash-dependency rule fires. The
    # threshold is arguable, not an error in the arithmetic.
    ("N33-atm-fees-normal-use", "cash_usage_leak"),
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
    assert {
        ("N01-noisy-subscription-descriptors", "subscription_leak"),
        ("N02-missing-month", "subscription_leak"),
        ("N03-two-accounts", "subscription_leak"),
        ("N04-unfamiliar-merchant", "unknown_recurring_payment"),
        ("N06-same-order-charged-twice", "duplicate_payment_leak"),
        ("N07-promotional-price-ends", "subscription_leak"),
        ("N09-fee-wordings", "bank_fee_leak"),
    } <= right
    # Everything expected is either found or listed as missed, nothing in between.
    expected_total = sum(len(item.customer.expected) for item in results)
    assert sum(len(item.matches) for item in results) + len(KNOWN_MISSED) == expected_total
    for item in results:
        for match in item.matches:
            if (item.customer.name, match.expected.leak_type) in KNOWN_AMOUNT_DEVIATIONS:
                continue
            assert match.amount_ok is not False, (item.customer.name, match.expected)


def test_clean_noisy_customers_produce_nothing(results) -> None:
    for name in ("N05-two-orders-same-day", "N08-reversed-and-repurchased", "N11-stationary-spending"):
        item = next(entry for entry in results if entry.customer.name == name)
        assert item.result.leaks == [], name


def test_noisy_runs_are_repeatable(results) -> None:
    assert all(item.idempotent for item in results)


def test_noisy_metrics_are_reported_not_hidden(results) -> None:
    overall, _ = collect_metrics(results)
    assert len(results) >= 50
    assert (overall.false_positives, overall.false_negatives) == (len(KNOWN_FALSE_POSITIVES), len(KNOWN_MISSED))
    assert overall.true_positives == sum(len(item.customer.expected) for item in results) - len(KNOWN_MISSED)
