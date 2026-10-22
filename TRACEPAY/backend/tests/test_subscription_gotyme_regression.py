"""Regression fixtures built from real GoTyme statement shapes.

Descriptions follow the GoTyme layout (card purchases, ``Int Recurring
Payment`` rows and ``Fee: Unsuccessful ...`` rows that carry the R10 fee in the
Debits column). Personal details are replaced with neutral values.
"""

from dataclasses import replace
from datetime import date
from decimal import Decimal
import random

from categorisation.models import CategorisationResult
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.subscription_detection import (
    classify_row,
    detect_subscriptions,
    normalise_merchant,
)

OPENAI_RECURRING = "Int Recurring Payment from OPENAI *CHATGPT SUBSCR +14158799686 US"
OPENAI_CARD = "Int Purchase, with card at EPOS at OPENAI *CHATGPT SUBSCR +14158799686 US"
OPENAI_FAILED = (
    "Fee: Unsuccessful Int Recurring Payment from OPENAI *CHATGPT SUBSCR +14158799686 US "
    "for ZAR149.00 due to insufficient funds"
)
CURSOR_RECURRING = "Int Recurring Payment from CURSOR, AI POWERED IDE +18314259504 US"
APPLE_RECURRING = "Int Recurring Payment from APPLE.COM/BILL ITUNES.COM IE"
APPLE_FAILED = (
    "Fee: Unsuccessful Int Recurring Payment from APPLE.COM/BILL ITUNES.COM IE "
    "for ZAR179.99 due to insufficient funds"
)
SPOTIFY_RECURRING = "Int Recurring Payment from SpotifyZA"


def tx(identifier, day, description, amount, *, category="Subscriptions", kind="debit", klass="spending"):
    return FeatureTransaction(
        transaction_id=identifier,
        user_id="user-1",
        amount=Decimal(str(amount)),
        description=description,
        transaction_date=date.fromisoformat(day),
        transaction_type=kind,
        categorisation=CategorisationResult(
            category_name=category,
            rule="test",
            transaction_class=klass,
            category_confidence=0.9,
            classification_confidence=0.9,
        ),
    )


def fee(identifier, day, description, amount="10.00"):
    return tx(identifier, day, description, amount, category="Bank Fees", klass="bank_fee")


CHATGPT = [
    tx("gpt-1", "2026-06-15", OPENAI_CARD, "149.00"),
    tx("gpt-2", "2026-07-15", OPENAI_RECURRING, "149.00"),
    tx("gpt-3", "2026-08-15", OPENAI_RECURRING, "149.00"),
    fee("gpt-f1", "2026-09-15", OPENAI_FAILED),
    fee("gpt-f2", "2026-09-18", OPENAI_FAILED),
    fee("gpt-f3", "2026-09-20", OPENAI_FAILED),
    fee("gpt-f4", "2026-09-22", OPENAI_FAILED),
    tx("gpt-4", "2026-09-24", OPENAI_RECURRING, "149.00"),
    fee("gpt-f5", "2026-10-15", OPENAI_FAILED),
    fee("gpt-f6", "2026-10-18", OPENAI_FAILED),
]

CURSOR_SUBSCRIPTION = [
    tx("cur-1", "2026-05-15", CURSOR_RECURRING, "351.15"),
    tx("cur-2", "2026-06-15", CURSOR_RECURRING, "351.15"),
    tx("cur-3", "2026-07-15", CURSOR_RECURRING, "351.15"),
    tx("cur-4", "2026-08-15", CURSOR_RECURRING, "351.15"),
    tx("cur-5", "2026-09-24", CURSOR_RECURRING, "351.15"),
    tx("cur-6", "2026-10-02", CURSOR_RECURRING, "351.15"),
    tx("cur-7", "2026-10-16", CURSOR_RECURRING, "341.94"),
]

CURSOR_USAGE = [
    tx("use-1", "2026-04-30", "Int Purchase, with card at EPOS at CURSOR USAGE APR +18314259504 US", "172.94"),
    tx("use-2", "2026-05-31", "Int Purchase, with card at EPOS at CURSOR USAGE MAY +18314259504 US", "168.14"),
    tx("use-3", "2026-09-30", "Int Purchase, with card at EPOS at CURSOR USAGE SEP +18314259504 US", "19.63"),
    tx("use-4", "2026-10-16", "Int Purchase, with card at EPOS at CURSOR USAGE MID OCT +18314259504 US", "341.94"),
]

APPLE_SMALL = [
    tx("app-1", "2026-05-06", APPLE_RECURRING, "14.99"),
    tx("app-2", "2026-06-06", APPLE_RECURRING, "14.99"),
    tx("app-3", "2026-07-06", APPLE_RECURRING, "14.99"),
    tx("app-4", "2026-08-06", APPLE_RECURRING, "14.99"),
    tx("app-5", "2026-09-06", APPLE_RECURRING, "14.99"),
    tx("app-6", "2026-10-10", APPLE_RECURRING, "14.99"),
]

APPLE_LARGE = [
    fee("big-f1", "2026-09-01", APPLE_FAILED),
    tx("big-1", "2026-09-02", APPLE_RECURRING, "179.99"),
    fee("big-f2", "2026-10-02", APPLE_FAILED),
    fee("big-f3", "2026-10-05", APPLE_FAILED),
    fee("big-f4", "2026-10-08", APPLE_FAILED),
    fee("big-f5", "2026-10-12", APPLE_FAILED),
    tx("big-2", "2026-10-16", APPLE_RECURRING, "179.99"),
]

SPOTIFY = [
    tx("spot-1", "2026-07-31", SPOTIFY_RECURRING, "69.99"),
    tx("spot-2", "2026-08-31", SPOTIFY_RECURRING, "69.99"),
    tx("spot-3", "2026-09-30", SPOTIFY_RECURRING, "69.99"),
]

EXCLUSIONS = [
    # Rides and food are tagged Recurring Payment by the bank but are not subscriptions.
    tx("uber-1", "2026-07-03", "Int Recurring Payment from UBER *TRIP HELP.UBER.COM NL", "89.00"),
    tx("uber-2", "2026-08-03", "Int Recurring Payment from UBER *TRIP HELP.UBER.COM NL", "89.00"),
    tx("uber-3", "2026-09-03", "Int Recurring Payment from UBER *TRIP HELP.UBER.COM NL", "89.00"),
    tx("eats-1", "2026-07-12", "Int Recurring Payment from UBER *EATS", "145.50"),
    tx("eats-2", "2026-08-12", "Int Recurring Payment from UBER *EATS", "145.50"),
    tx("bolt-1", "2026-07-20", "Int Recurring Payment from BOLT.EU/O/2607201830", "62.00"),
    tx("bolt-2", "2026-08-20", "Int Recurring Payment from BOLT.EU/O/2608201830", "62.00"),
    tx("goal-1", "2026-07-25", "Money transferred out for GoalSave", "500.00", category="Transfers", klass="internal_transfer"),
    tx("goal-2", "2026-08-25", "Money transferred out for GoalSave", "500.00", category="Transfers", klass="internal_transfer"),
    tx("goal-3", "2026-09-25", "Money transferred in for GoalSave", "500.00", category="Transfers", kind="credit", klass="internal_transfer"),
    tx("fd-1", "2026-07-26", "Money added to Fixed Deposit", "1000.00", category="Savings", klass="savings"),
    tx("fd-2", "2026-08-26", "Money added to Fixed Deposit", "1000.00", category="Savings", klass="savings"),
    tx("vas-1", "2026-07-01", "VAS - Mobile Purchase Vodacom 0821234567", "99.00", category="Airtime & Data"),
    tx("vas-2", "2026-08-01", "VAS - Mobile Purchase Vodacom 0821234567", "99.00", category="Airtime & Data"),
    tx("vas-3", "2026-09-01", "VAS purchase MTN 0831234567", "99.00", category="Airtime & Data"),
    fee("fee-1", "2026-07-05", "Fee: Int Card Transaction", "3.00"),
    fee("fee-2", "2026-08-05", "Fee: Int Card Transaction", "3.00"),
    fee("fee-3", "2026-09-05", "Fee: Int Card Transaction", "3.00"),
    tx("feerev-1", "2026-09-06", "Fee Reversal: Int Card Transaction", "3.00", category="Bank Fees", kind="credit"),
    tx("pay-1", "2026-07-28", "PayShap Payment to J Person Ref 7781234", "300.00", category="Transfers"),
    tx("pay-2", "2026-08-28", "PayShap Payment to J Person Ref 7789876", "300.00", category="Transfers"),
    tx("once-1", "2026-07-29", "Once-Off Payment to Landlord", "4500.00", category="Housing"),
    tx("once-2", "2026-08-29", "Once-Off Payment to Landlord", "4500.00", category="Housing"),
    tx("atm-1", "2026-07-02", "ATM Withdrawal Branch: Sandton City", "500.00", category="Cash Withdrawal"),
    tx("atm-2", "2026-08-02", "ATM Withdrawal Branch: Sandton City", "500.00", category="Cash Withdrawal"),
    tx("groc-1", "2026-07-04", "Int Purchase, with card at EPOS at CHECKERS HYPER SANDTON", "820.00", category="Groceries"),
    tx("groc-2", "2026-08-04", "Int Purchase, with card at EPOS at CHECKERS HYPER SANDTON", "820.00", category="Groceries"),
    # A reversed Netflix charge cancels its original, leaving a single payment.
    tx("nfx-1", "2026-07-03", "Int Recurring Payment from NETFLIX.COM", "199.00"),
    tx("nfx-2", "2026-08-03", "Int Recurring Payment from NETFLIX.COM", "199.00"),
    tx("nfx-rev", "2026-08-04", "Reversal - Int Recurring Payment from NETFLIX.COM", "199.00", kind="credit"),
]

STATEMENT = CHATGPT + CURSOR_SUBSCRIPTION + CURSOR_USAGE + APPLE_SMALL + APPLE_LARGE + SPOTIFY + EXCLUSIONS


def _by_product(result, merchant_key, amount=None, classification=None):
    matches = [
        item for item in result
        if item.merchant_key == merchant_key
        and (classification is None or item.classification == classification)
        and (amount is None or Decimal(str(amount)) in item.amount_history)
    ]
    assert len(matches) == 1, [item.product_key for item in result]
    return matches[0]


def test_failed_attempt_rows_are_classified_and_never_payments():
    assert classify_row(fee("x", "2026-09-15", OPENAI_FAILED)) == "failed_attempt"
    assert classify_row(fee("x", "2026-09-15", "Fee: Int Card Transaction", "3.00")) == "fee"
    assert classify_row(tx("x", "2026-09-15", "Fee Reversal: Int Card Transaction", "3", kind="credit")) == "fee_reversal"
    assert classify_row(tx("x", "2026-09-15", "Reversal - Int Recurring Payment from NETFLIX.COM", "199", kind="credit")) == "reversal"
    assert classify_row(tx("x", "2026-09-15", "Money transferred out for GoalSave", "500")) == "internal_transfer"
    assert classify_row(tx("x", "2026-09-15", "Int Recurring Payment from UBER *TRIP", "89")) == "excluded_category"
    assert classify_row(tx("x", "2026-09-15", OPENAI_CARD, "149")) == "payment"


def test_normalisation_strips_noise_and_boilerplate():
    assert normalise_merchant(OPENAI_RECURRING) == "OPENAI CHATGPT SUBSCR"
    assert normalise_merchant(OPENAI_CARD) == "OPENAI CHATGPT SUBSCR"
    assert normalise_merchant(OPENAI_FAILED) == "OPENAI CHATGPT SUBSCR"
    assert normalise_merchant(CURSOR_RECURRING) == "CURSOR, AI POWERED IDE"
    assert normalise_merchant(APPLE_RECURRING) == "APPLE.COM/BILL ITUNES.COM"
    assert normalise_merchant("ATM Withdrawal Branch: Sandton e-Stamp 12345 2026-09-01") == "ATM WITHDRAWAL"
    assert normalise_merchant("Int Purchase\nwith card at EPOS at ATLAS STUDIOS") == "ATLAS STUDIOS"


def test_chatgpt_fee_rows_are_failed_attempts_not_the_price():
    result = detect_subscriptions(STATEMENT)
    group = _by_product(result, "CHATGPT")
    assert group.canonical_name == "chatgpt"
    assert group.classification == "fixed"
    assert group.cadence == "monthly"
    assert group.current_amount == Decimal("149.00")
    assert group.estimated_monthly_cost == Decimal("149.00")
    assert group.status in {"late", "active"}
    assert group.successful_payment_count >= 4
    assert group.successful_transaction_ids == ["gpt-1", "gpt-2", "gpt-3", "gpt-4"]
    assert group.failed_payment_attempt_count >= 5
    assert group.total_failure_fees == Decimal("60.00")
    assert Decimal("10.00") not in group.amount_history
    assert group.late_payment_dates == [date(2026, 9, 24)]
    assert group.expected_day_of_month == 15
    observed = {item.transaction_id: item.outcome for item in group.observations}
    assert observed["gpt-f1"] == "failed" and observed["gpt-4"] == "successful"


def test_cursor_subscription_keeps_price_history():
    result = detect_subscriptions(STATEMENT)
    group = _by_product(result, "CURSOR", classification="fixed")
    assert group.canonical_name == "cursor"
    assert group.cadence == "monthly"
    assert group.current_amount == Decimal("341.94")
    assert group.estimated_monthly_cost == Decimal("341.94")
    assert group.amount_history[:6] == [Decimal("351.15")] * 6
    assert group.price_changes == [{"date": "2026-10-16", "from": Decimal("351.15"), "to": Decimal("341.94")}]
    assert group.successful_transaction_ids == ["cur-1", "cur-2", "cur-3", "cur-4", "cur-5", "cur-6", "cur-7"]


def test_cursor_usage_is_variable_spend_and_same_day_charges_split():
    result = detect_subscriptions(STATEMENT)
    usage = _by_product(result, "CURSOR", classification="variable")
    assert usage.canonical_name == "cursor_usage"
    assert usage.amount_history == [Decimal("172.94"), Decimal("168.14"), Decimal("19.63"), Decimal("341.94")]
    # Monthly estimate is real spend over the statement window (Apr-Oct, 7 months).
    assert usage.estimated_monthly_cost == (Decimal("702.65") / 7).quantize(Decimal("0.01"))
    # The two R341.94 debits on 2026-10-16 are one subscription charge and one usage charge.
    subscription = _by_product(result, "CURSOR", classification="fixed")
    assert "cur-7" in subscription.successful_transaction_ids
    assert "use-4" in usage.successful_transaction_ids


def test_apple_products_are_separate():
    result = detect_subscriptions(STATEMENT)
    small = _by_product(result, "APPLE", amount="14.99")
    large = _by_product(result, "APPLE", amount="179.99")
    assert small.product_key != large.product_key
    assert small.classification == "fixed" and small.cadence == "monthly"
    assert small.current_amount == Decimal("14.99")
    assert small.estimated_monthly_cost == Decimal("14.99")
    assert small.successful_payment_count == 6
    assert small.failed_payment_attempt_count == 0
    assert large.current_amount == Decimal("179.99")
    assert large.successful_transaction_ids == ["big-1", "big-2"]
    assert large.failed_payment_attempt_count == 5
    assert large.total_failure_fees == Decimal("50.00")
    assert large.late_payment_dates == [date(2026, 10, 16)]


def test_spotify_monthly_active():
    result = detect_subscriptions(STATEMENT)
    group = _by_product(result, "SPOTIFY")
    assert group.classification == "fixed"
    assert group.cadence == "monthly"
    assert group.current_amount == Decimal("69.99")
    assert group.estimated_monthly_cost == Decimal("69.99")
    assert group.status == "active"
    assert group.next_expected_date == date(2026, 10, 31)


def test_exclusions_produce_no_subscriptions():
    assert detect_subscriptions(EXCLUSIONS) == []
    keys = {item.merchant_key for item in detect_subscriptions(STATEMENT)}
    assert keys == {"CHATGPT", "CURSOR", "APPLE", "SPOTIFY"}


def test_statement_detects_exactly_the_expected_products():
    result = detect_subscriptions(STATEMENT)
    assert sorted((item.merchant_key, item.classification) for item in result) == [
        ("APPLE", "fixed"), ("APPLE", "fixed"), ("CHATGPT", "fixed"),
        ("CURSOR", "fixed"), ("CURSOR", "variable"), ("SPOTIFY", "fixed"),
    ]


def test_detection_is_deterministic_and_idempotent():
    baseline = detect_subscriptions(STATEMENT)
    shuffled = list(STATEMENT)
    for seed in range(5):
        random.Random(seed).shuffle(shuffled)
        assert detect_subscriptions(shuffled) == baseline
    assert detect_subscriptions(STATEMENT) == baseline


def test_negative_debit_amounts_are_handled():
    rows = [tx(row.transaction_id, row.transaction_date.isoformat(), row.description, -row.amount) for row in SPOTIFY]
    group = _by_product(detect_subscriptions(rows), "SPOTIFY")
    assert group.current_amount == Decimal("69.99")


def test_sparse_cadence_monthly_estimate_uses_real_gap():
    rows = [
        tx("s-1", "2026-06-01", "Int Recurring Payment from ICLOUD STORAGE", "4.99"),
        tx("s-2", "2026-08-01", "Int Recurring Payment from ICLOUD STORAGE", "4.99"),
    ]
    group = _by_product(detect_subscriptions(rows), "ICLOUD STORAGE")
    assert group.cadence == "bimonthly"
    assert group.estimated_monthly_cost == (Decimal("4.99") * 30 / 61).quantize(Decimal("0.01"))
    assert group.estimated_monthly_cost != Decimal("4.99")


def test_single_payment_without_failures_is_not_reported():
    assert detect_subscriptions([tx("one", "2026-09-01", "Int Recurring Payment from NETFLIX.COM", "199")]) == []


def test_single_payment_with_failed_attempts_is_low_confidence():
    rows = [
        tx("one", "2026-09-01", "Int Recurring Payment from NETFLIX.COM", "199.00"),
        fee("f-1", "2026-10-01", "Fee: Unsuccessful Int Recurring Payment from NETFLIX.COM for ZAR199.00 insufficient funds"),
    ]
    group = _by_product(detect_subscriptions(rows), "NETFLIX")
    assert group.confidence == "low"
    assert group.current_amount == Decimal("199.00")
    assert group.status == "failed_recently"


def test_imported_duplicates_with_same_balance_are_dropped():
    first = replace(tx("d-1", "2026-07-31", SPOTIFY_RECURRING, "69.99"), balance=Decimal("1000.00"))
    again = replace(tx("d-2", "2026-07-31", SPOTIFY_RECURRING, "69.99"), balance=Decimal("1000.00"))
    group = _by_product(detect_subscriptions([first, again] + SPOTIFY[1:]), "SPOTIFY")
    assert group.successful_transaction_ids == ["d-1", "spot-2", "spot-3"]


def test_resolver_only_names_unknown_merchants():
    seen: list[list[str]] = []

    def resolver(strings):
        seen.append(strings)
        return {"STREAMCO PREMIUM": ("streamco", "StreamCo")}

    rows = [
        tx("m-1", "2026-07-10", "Int Recurring Payment from STREAMCO PREMIUM 0861234567", "99.00"),
        tx("m-2", "2026-08-10", "Int Recurring Payment from STREAMCO PREMIUM 0861234567", "99.00"),
    ] + SPOTIFY
    result = detect_subscriptions(rows, merchant_resolver=resolver)
    assert seen == [["STREAMCO PREMIUM"]]
    group = next(item for item in result if item.canonical_name == "streamco")
    assert group.merchant_name == "StreamCo"
    assert group.current_amount == Decimal("99.00")


def test_resolver_failure_falls_back_to_deterministic_result():
    def broken(_strings):
        raise TimeoutError

    assert detect_subscriptions(STATEMENT, merchant_resolver=broken) == detect_subscriptions(STATEMENT)
