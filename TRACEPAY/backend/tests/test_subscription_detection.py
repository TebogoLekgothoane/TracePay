from datetime import date
from decimal import Decimal

from categorisation.models import CategorisationResult
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.subscription_detection import detect_subscriptions


def tx(identifier, day, description, amount, *, category="Subscriptions", rule="test"):
    return FeatureTransaction(
        transaction_id=identifier,
        user_id="user-1",
        amount=Decimal(str(amount)),
        description=description,
        transaction_date=date.fromisoformat(day),
        transaction_type="debit",
        categorisation=CategorisationResult(
            category_name=category,
            rule=rule,
            transaction_class="spending",
            category_confidence=0.99,
            classification_confidence=0.99,
        ),
    )


def test_failed_payment_fee_is_evidence_not_a_subscription_payment():
    rows = [
        tx("ok-1", "2025-01-05", "RECURRING CARD PURCHASE: CHATGPT", 149),
        tx("failed-fee", "2025-02-05", "CHATGPT UNSUCCESSFUL PAYMENT INSUFFICIENT FUNDS FEE", 10, category="Bank Fees", rule="description:service-fee"),
        tx("ok-2", "2025-02-05", "RECURRING CARD PURCHASE: CHATGPT", 149),
        tx("ok-3", "2025-03-05", "RECURRING CARD PURCHASE: CHATGPT", 149),
    ]
    result = detect_subscriptions(rows)
    assert len(result) == 1
    assert result[0].current_amount == Decimal("149")
    assert result[0].successful_transaction_ids == ["ok-1", "ok-2", "ok-3"]
    assert result[0].failed_transaction_ids == ["failed-fee"]
    assert result[0].estimated_monthly_cost == Decimal("149.00")


def test_same_merchant_different_products_are_separate_and_price_changes_are_history():
    rows = [
        tx("a-1", "2025-01-02", "APPLE.COM/BILL", "14.99"),
        tx("a-2", "2025-02-02", "APPLE.COM/BILL", "14.99"),
        tx("b-1", "2025-01-10", "APPLE.COM/BILL", "179.99"),
        tx("b-2", "2025-02-10", "APPLE.COM/BILL", "179.99"),
        tx("c-1", "2025-01-15", "CURSOR", "351.15"),
        tx("c-2", "2025-02-15", "CURSOR", "341.94"),
    ]
    result = detect_subscriptions(rows)
    apple = [item for item in result if item.merchant_key == "APPLE"]
    cursor = [item for item in result if item.merchant_key == "CURSOR"]
    assert sorted(item.current_amount for item in apple) == [Decimal("14.99"), Decimal("179.99")]
    assert len(cursor) == 1
    assert cursor[0].classification == "fixed"
    assert cursor[0].amount_history == [Decimal("351.15"), Decimal("341.94")]


def test_ride_hailing_is_not_a_subscription_and_output_is_stable():
    rows = [
        tx("u-2", "2025-02-02", "UBER", "149", category="Subscriptions"),
        tx("u-1", "2025-01-02", "UBER", "149", category="Subscriptions"),
    ]
    assert detect_subscriptions(rows) == []
    assert detect_subscriptions(list(reversed(rows))) == []


def test_late_monthly_payment_keeps_monthly_cadence_and_reports_lateness():
    rows = [
        tx("m-1", "2025-01-05", "RECURRING PAYMENT FROM SPOTIFY", "69.99"),
        tx("m-2", "2025-02-15", "RECURRING PAYMENT FROM SPOTIFY", "69.99"),
        tx("m-3", "2025-03-05", "RECURRING PAYMENT FROM SPOTIFY", "69.99"),
    ]
    result = detect_subscriptions(rows)
    assert len(result) == 1
    assert result[0].cadence == "monthly"
    assert result[0].late_payment_count == 1
    assert result[0].estimated_monthly_cost == Decimal("69.99")


def test_chatgpt_aliases_ignore_failed_fee_amounts_and_report_late_success():
    rows = [
        tx("g-1", "2026-06-15", "OPENAI *CHATGPT SUBSCR", "149"),
        tx("g-2", "2026-07-15", "Int Purchase, with card at EPOS at OPENAI", "149"),
        tx("g-3", "2026-08-15", "Int Recurring Payment from OPENAI", "149"),
        tx("g-f1", "2026-09-15", "Fee: Unsuccessful OPENAI for R149.00 insufficient funds", "10", category="Bank Fees", rule="description:service-fee"),
        tx("g-f2", "2026-09-18", "Fee: Unsuccessful OPENAI for R149.00 insufficient funds", "10", category="Bank Fees", rule="description:service-fee"),
        tx("g-f3", "2026-09-20", "Fee: Unsuccessful OPENAI for R149.00 insufficient funds", "10", category="Bank Fees", rule="description:service-fee"),
        tx("g-f4", "2026-09-22", "Fee: Unsuccessful OPENAI for R149.00 insufficient funds", "10", category="Bank Fees", rule="description:service-fee"),
        tx("g-4", "2026-09-24", "Int Recurring Payment from OPENAI", "149"),
    ]
    result = detect_subscriptions(rows)
    assert len(result) == 1
    group = result[0]
    assert group.merchant_key == "CHATGPT"
    assert group.current_amount == Decimal("149")
    assert group.estimated_monthly_cost == Decimal("149.00")
    assert group.failed_payment_attempt_count == 4
    assert group.total_failure_fees == Decimal("40")
    assert group.late_payment_count == 1
    assert group.status == "late"
    assert group.successful_transaction_ids == ["g-1", "g-2", "g-3", "g-4"]


def test_cursor_usage_separated_from_subscription_and_exclusions():
    rows = [
        tx("c-1", "2026-08-01", "CURSOR PRO MONTHLY", "351.15"),
        tx("c-2", "2026-09-01", "CURSOR PRO MONTHLY", "351.15"),
        tx("c-3", "2026-10-01", "CURSOR PRO MONTHLY", "341.94"),
        tx("c-u1", "2026-09-10", "CURSOR USAGE", "164.91"),
        tx("c-u2", "2026-10-10", "CURSOR USAGE", "87.20"),
        tx("ride-1", "2026-08-10", "UBER RECURRING PAYMENT", "100"),
        tx("ride-2", "2026-09-10", "UBER RECURRING PAYMENT", "100"),
        tx("goal-1", "2026-08-20", "MONEY TRANSFERRED OUT FROM GOALSAVE", "500"),
        tx("goal-2", "2026-09-20", "MONEY TRANSFERRED OUT FROM GOALSAVE", "500"),
    ]
    result = detect_subscriptions(rows)
    cursor = [item for item in result if item.merchant_key == "CURSOR"]
    assert len(cursor) == 2
    subscription = next(item for item in cursor if item.classification == "fixed")
    usage = next(item for item in cursor if item.classification == "variable")
    assert subscription.current_amount == Decimal("341.94")
    assert subscription.amount_history == [Decimal("351.15"), Decimal("351.15"), Decimal("341.94")]
    assert usage.amount_history == [Decimal("164.91"), Decimal("87.20")]
    assert all(item.merchant_key not in {"UBER", "GOALSAVE"} for item in result)
