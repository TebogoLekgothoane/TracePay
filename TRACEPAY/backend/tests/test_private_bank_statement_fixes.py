"""Findings from a real private-bank statement set: transfers, hidden plans, catch-up debits."""

from __future__ import annotations

from datetime import date

import pytest

from categorisation.classifier import classify_transaction
from tests.test_dominant_amount_recurrence import _charges, _subscription


@pytest.mark.parametrize(
    ("description", "transaction_class"),
    [
        ("wedding (FP)", "person_to_person"),
        ("rent", "person_to_person"),
        ("Cash Management", "internal_transfer"),
        ("Savings", "internal_transfer"),
        ("OWN ACCOUNT 1", "internal_transfer"),
        ("LINKED ACCOUNT 3", "internal_transfer"),
    ],
)
def test_money_moved_is_not_a_purchase(description, transaction_class):
    assert classify_transaction(description, "debit").transaction_class == transaction_class


def test_a_food_delivery_habit_survives_one_quiet_month():
    from tests.test_leak_detection import _detect, _transaction

    rows = [
        _transaction(f"u{month}{day}", "190", date(2026, month, day), merchant="UBER EATS", category="Fast Food")
        for month in (6, 7, 8, 9)
        for day in (3, 11, 19, 27)
    ]
    rows.append(_transaction("later", "420", date(2026, 10, 20), merchant="CHECKERS", category="Groceries"))
    leaks = _detect(rows).leaks
    assert any(leak.leak_type == "food_spending_leak" for leak in leaks)


def _unknown_payment_result():
    from leak_intelligence.finding_questions import apply_answers, select_questions
    from tests.test_finding_questions import _detect
    from tests.test_detection_rules_and_claims import _monthly, _statement

    extra = _monthly(5, (2026, 1), 9, "ZXQ HOLDINGS", "2580")
    result = _detect(_statement((2026, 1), 9, extra))
    leak = next(item for item in result.leaks if item.leak_type == "unknown_recurring_payment")
    questions, _ = select_questions([leak], {})
    return result, leak, questions, apply_answers


def test_an_unnamed_regular_payment_asks_what_it_is_for():
    _, _, questions, _ = _unknown_payment_result()
    purpose = [item for item in questions if item.kind == "payment_purpose"]
    assert len(purpose) == 1
    assert "not_sure" in {option.value for option in purpose[0].options}


@pytest.mark.parametrize(
    ("answer", "status"),
    [("savings", "dismissed"), ("person", "dismissed"), ("credit", "open"), ("other", "open")],
)
def test_what_the_user_says_it_is_decides_whether_it_stays(answer, status):
    from tests.test_finding_questions import _answer

    result, leak, questions, apply_answers = _unknown_payment_result()
    question = next(item for item in questions if item.kind == "payment_purpose")
    subject = question.question_key.split(":", 1)[1]
    answers = _answer("payment_purpose", subject, answer, signature=question.signature)
    applied = apply_answers(result, answers)
    updated = next(item for item in applied.leaks if item.leak_id == leak.leak_id)
    assert updated.status == (status if status == "dismissed" else leak.status)
    assert any(fact.answer == answer for fact in updated.claims.reported)


def test_a_catch_up_payment_is_not_called_a_price_increase():
    rows = [("835", date(2026, month, 1)) for month in (6, 7, 8, 9)] + [("1670", date(2026, 10, 1))]
    leak = _subscription(_charges("g", "VIRGIN ACTIVE", rows), "VIRGIN ACTIVE")
    assert leak is not None
    assert leak.evidence.get("headline_impact_basis") != "price_increase"
    assert leak.estimated_monthly_impact == 835


def test_a_lower_price_held_for_two_charges_is_the_current_cost():
    rows = [("1054.66", date(2026, month, 28)) for month in (6, 7, 8)] + [
        ("676.23", date(2026, 9, 28)),
        ("676.23", date(2026, 10, 28)),
    ]
    leak = _subscription(_charges("p", "PINEAPPLE", rows), "PINEAPPLE")
    assert leak is not None
    assert leak.estimated_monthly_impact == 676.23


def test_a_small_monthly_plan_is_found_inside_a_busy_app_store_merchant():
    plan = _charges("p", "APPLE", [("69.99", date(2026, month, 18)) for month in (6, 7, 8, 10)])
    noise = _charges(
        "n",
        "APPLE",
        [
            (f"{10 + i * 13}.{i:02d}", date(2026, 6 + i % 5, 1 + (i * 3) % 27))
            for i in range(40)
        ],
    )
    leak = _subscription(plan + noise, "APPLE")
    assert leak is not None
    assert leak.evidence["recurrence_basis"] == "dominant_amount"
