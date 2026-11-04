"""Findings from a real private-bank statement set: transfers, hidden plans, catch-up debits."""

from __future__ import annotations

from datetime import date

from decimal import Decimal

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
    assert leak.estimated_monthly_impact == Decimal("676.23")


@pytest.mark.parametrize(
    ("description", "transaction_class"),
    [
        ("DIGITAL TRANSF DT 45502715-0664-1011 ABSA BANK", "internal_transfer"),
        ("DIGITAL PAYMENT DT ABSA BANK Neo", "person_to_person"),
        ("DC TRACK INTERNAL WONGA LOAN00000001146656260529", "spending"),
        ("CASHSEND DIGITAL CARD NO. 1212 ABSA BANK cash", "spending"),
    ],
)
def test_absa_wording_is_classified(description, transaction_class):
    assert classify_transaction(description, "debit").transaction_class == transaction_class


def test_short_term_lenders_repaid_twice_are_raised_without_a_schedule():
    from tests.test_leak_detection import _detect, _transaction

    rows = [
        _transaction("w1", "2665.76", date(2026, 6, 2), merchant="WONGA", category="Loans & Credit"),
        _transaction("w2", "2665.76", date(2026, 7, 9), merchant="WONGA", category="Loans & Credit"),
        _transaction("c1", "420", date(2026, 7, 14), merchant="CHECKERS", category="Groceries"),
    ]
    leaks = [item for item in _detect(rows).leaks if item.leak_type == "high_cost_credit_leak"]
    assert leaks
    assert leaks[0].evidence["finding_focus"] == "short_term_lenders"


@pytest.mark.parametrize(
    ("description", "key"),
    [
        ("TRANSACTION FEE PayShap Ext Debit (EFF:020626 AMT: -1000,00-)", "payshap"),
        ("TRANSACTION FEE DECL POS TRAN FEE (EFF:050626 AMT: 0,00 )", "declined_card"),
        ("TRANSACTION FEE (EFFEC 24062026) UNSUCCESSFUL INT", "failed_debit_order"),
        ("TRANSACTION FEE CASHSEND DIGITAL (EFF:020626 AMT: 500,00-)", "cash_send"),
        ("MONTHLY ACC FEE", "account_fee"),
        ("Cross-border card fee - APPLE.COM/BILL", "cross_border"),
        ("SOMETHING ELSE", "other"),
    ],
)
def test_fees_are_grouped_into_plain_sources(description, key):
    from leak_intelligence.engine import _fee_source_of

    assert _fee_source_of(description)[0] == key


def test_monthly_account_fee_is_a_bank_fee():
    assert classify_transaction("MONTHLY ACC FEE", "debit").transaction_class == "bank_fee"


def test_fee_notes_show_the_fee_as_a_share_of_the_cash_sent():
    from decimal import Decimal as D

    from leak_intelligence.engine import _fee_source_notes

    detail, check = _fee_source_notes("cash_send", 7, D("8.10"), [D("500")], D("2.9"))
    assert "2.9%" in detail
    assert check


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
