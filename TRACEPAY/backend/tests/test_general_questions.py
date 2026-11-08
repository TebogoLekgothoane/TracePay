"""Findings and questions work for any merchant, category and bank, not one customer's statements."""

import re
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.finding_questions import (
    StoredAnswer,
    _candidates,
    apply_answers,
    is_valid_answer,
    parse_question_key,
)
from leak_intelligence.leak_claims import _day, _money
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.statement_review import (
    _delivery_habit,
    _fee_breakdown,
    _optional_charges,
    delivery_service,
)
from tests.benchmark.noisy_customers import build_noisy_customers

SHOPPING = CategorisationResult(
    category_name="Shopping", category_confidence=0.9, rule="t",
    transaction_class="spending", classification_confidence=0.9, classification_reason="t",
)
FEE = CategorisationResult(
    category_name="Bank Fees", category_confidence=0.95, rule="t",
    transaction_class="bank_fee", classification_confidence=0.95, classification_reason="t",
)


def _tx(index: int, description: str, amount: str, day: date, categorisation=SHOPPING, merchant=None):
    return FeatureTransaction(
        transaction_id=f"t{index}", user_id="u", amount=Decimal(amount), transaction_date=day,
        description=description, merchant_name=merchant, transaction_type="debit",
        categorisation=categorisation,
    )


def _answer(question, value: str) -> dict:
    return {
        question.question_key: StoredAnswer(
            question_key=question.question_key, kind=question.kind, answer=value,
            signature=question.signature, answered_at=datetime(2026, 11, 8, tzinfo=timezone.utc),
        )
    }


# ---------------------------------------------------------------- the engine's own findings


def _unusual_purchase_result(merchant: str, description: str, amount: str):
    txs = [
        _tx(i, f"TAKEALOT {i}", "180", date(2026, 3, 1) + timedelta(days=6 * i), merchant="Takealot")
        for i in range(14)
    ]
    txs.append(_tx(99, description, amount, date(2026, 4, 20), merchant=merchant))
    snapshot = build_financial_features("u", txs)
    return detect_leaks(snapshot, analyze_behaviour(snapshot))


@pytest.mark.parametrize(
    ("merchant", "description", "amount"),
    [
        ("Game", "GAME STORES SANDTON", "6200"),
        ("Incredible Connection", "INCREDIBLE CONNECTION RANDBURG", "9800"),
    ],
)
def test_an_unusual_charge_at_any_merchant_asks_whether_it_was_planned(merchant, description, amount) -> None:
    result = _unusual_purchase_result(merchant, description, amount)
    leak = next(item for item in result.leaks if item.leak_type == "irregular_transaction_leak")

    question = next(q for q in _candidates(leak, {}) if q.kind == "one_off_expected")

    # Worded and formatted like the engine's other questions: its own money and date helpers.
    expected = f"{merchant} charged {_money(Decimal(amount))} on {_day(date(2026, 4, 20))}, far more than is usual for shopping."
    assert question.prompt.startswith(expected)
    assert question.prompt.endswith("Was that planned?")
    assert parse_question_key(question.question_key) is not None
    assert is_valid_answer("one_off_expected", "planned")


def test_answers_about_an_unusual_charge_reach_the_finding() -> None:
    result = _unusual_purchase_result("Game", "GAME STORES SANDTON", "6200")
    leak = next(item for item in result.leaks if item.leak_type == "irregular_transaction_leak")
    question = next(q for q in _candidates(leak, {}) if q.kind == "one_off_expected")

    planned = apply_answers(result, _answer(question, "planned"))
    not_mine = apply_answers(result, _answer(question, "not_mine"))
    refunded = apply_answers(result, _answer(question, "refunded"))

    def of(applied):
        return next(item for item in applied.leaks if item.leak_type == "irregular_transaction_leak")

    assert of(planned).status == "dismissed"
    assert of(refunded).status == "resolved"
    assert of(not_mine).status == "active"
    assert any("don't recognise" in fact.text for fact in of(not_mine).claims.reported)


def test_a_category_finding_with_no_merchant_asks_whether_the_level_is_normal() -> None:
    customer = next(c for c in build_noisy_customers() if c.name == "N10-ordinary-spending")
    snapshot = build_financial_features(customer.transactions[0].user_id, customer.transactions)
    result = detect_leaks(snapshot, analyze_behaviour(snapshot))
    leak = next(item for item in result.leaks if item.leak_type == "transport_spending_leak")

    question = next(q for q in _candidates(leak, {}) if q.kind == "spending_level")

    assert question.prompt == (
        "Fuel spending increased by R102.50 compared with the previous period. Is that normal for you?"
    )
    assert question.question_key == "spending_level:fuel"
    assert question.signature.startswith("amt=")
    usual = apply_answers(result, _answer(question, "usual"))
    assert next(i for i in usual.leaks if i.leak_type == "transport_spending_leak").status == "dismissed"
    reopened = StoredAnswer(
        question_key=question.question_key, kind="spending_level", answer="usual",
        signature="amt=20", answered_at=datetime(2026, 11, 8, tzinfo=timezone.utc),
    )
    again = apply_answers(result, {question.question_key: reopened})
    assert next(i for i in again.leaks if i.leak_type == "transport_spending_leak").status == "active"


def test_a_finding_that_carries_its_own_questions_is_not_asked_twice() -> None:
    result = _unusual_purchase_result("Game", "GAME STORES SANDTON", "6200")
    leak = next(item for item in result.leaks if item.leak_type == "irregular_transaction_leak")
    review_made = leak.model_copy(update={"evidence": {**leak.evidence, "source": "statement_review"}})

    assert [q for q in _candidates(review_made, {}) if q.kind == "one_off_expected"] == []


# ------------------------------------------------------------------- delivery, any service


def _orders(description: str, count: int = 12, start: date = date(2026, 3, 1)):
    return [
        _tx(i, description, "150", start + timedelta(days=3 * i), categorisation=SHOPPING)
        for i in range(count)
    ]


@pytest.mark.parametrize(
    ("description", "name"),
    [
        ("UBER EATS JOHANNESBURG", "Uber Eats"),
        ("DL UBER CPT ZA", "Uber Eats"),
        ("MR D FOOD CAPE TOWN", "Mr D Food"),
        ("MRDFOOD*ORDER 8812", "Mr D Food"),
        ("BOLT FOOD SANDTON", "Bolt Food"),
    ],
)
def test_each_delivery_service_is_named_for_the_service_found(description: str, name: str) -> None:
    assert delivery_service(description) == name

    finding = _delivery_habit(_orders(description))

    assert finding is not None
    assert finding.title == name
    assert name in finding.questions[0].prompt
    assert "Uber Eats" not in finding.questions[0].prompt or name == "Uber Eats"


def test_several_services_make_one_food_delivery_finding_that_names_them_all() -> None:
    txs = [*_orders("UBER EATS JOHANNESBURG", 6), *_orders("MR D FOOD CAPE TOWN", 6, date(2026, 3, 2))]
    txs = [replace(tx, transaction_id=f"x{i}") for i, tx in enumerate(txs)]

    finding = _delivery_habit(txs)

    assert finding is not None and finding.title == "Food delivery"
    assert "Mr D Food and Uber Eats" in finding.questions[0].prompt
    assert finding.questions[0].subject == "Food delivery"


@pytest.mark.parametrize(
    "description",
    ["CHECKERS SIXTY60 ORDER", "WOOLWORTHS DASH", "PICK N PAY ASAP", "BOLT RIDE JOHANNESBURG", "UBER TRIP CPT"],
)
def test_groceries_and_rides_are_not_a_delivery_habit(description: str) -> None:
    assert delivery_service(description) is None
    assert _delivery_habit(_orders(description)) is None


# ---------------------------------------------------- recurring bank charges, any bank


@pytest.mark.parametrize(
    "description",
    ["Cashback Rewards Fee", "eBucks Rewards Premium", "Credit Life Cover Fee", "Greenbacks Membership"],
)
def test_any_bank_s_recurring_optional_charge_is_found_and_asked_about(description: str) -> None:
    days = (date(2026, 4, 25), date(2026, 5, 25), date(2026, 6, 25))
    txs = [_tx(i, description, "59.00", day, categorisation=FEE) for i, day in enumerate(days)]

    (finding,) = _optional_charges(txs)

    assert finding.leak_type == "subscription_leak"
    assert finding.figures["amount"] == Decimal("59.00")
    question = finding.questions[0]
    assert question.kind == "subscription_usage"
    assert "R59" in question.prompt and description in question.prompt
    assert parse_question_key(question.question_key) is not None
    # And it no longer counts as one of the account's own fees.
    others = [*txs, _tx(9, "Monthly Account Fee", "99.00", date(2026, 5, 1), categorisation=FEE)]
    fees, _ = _fee_breakdown(others, 3)
    assert fees is not None and description.lower() not in fees.shows.lower()


@pytest.mark.parametrize(
    "description",
    [
        "Monthly Account Fee",
        "Monthly Account Admin Fee",
        "SMS Notification Fee",
        "Service Fee",
        "Card Annual Fee",
        "Overdraft Interest",
        "Cross-border Card Fee",
        "Immediate Payment Fee",
        "Unpaid Debit Order Fee",
        # Fees for how the account is used: they repeat because the usage does.
        "INTERNATIONAL TRANSACTION FEE",
        "Foreign Currency Conversion Fee",
        "Cash Deposit Fee",
        "Balance Enquiry Fee",
        "ATM Withdrawal Fee",
        "Declined Transaction Fee",
    ],
)
def test_ordinary_bank_fees_are_not_raised_as_optional_charges(description: str) -> None:
    days = (date(2026, 4, 25), date(2026, 5, 25), date(2026, 6, 25))
    txs = [_tx(i, description, "59.00", day, categorisation=FEE) for i, day in enumerate(days)]

    assert _optional_charges(txs) == []


def _known_bank_fee_wordings() -> list[str]:
    """Every wording the categoriser files under Bank Fees, read from its own rules."""
    source = (Path(__file__).parent.parent / "categorisation" / "rules.py").read_text(encoding="utf-8")
    wordings: list[str] = []
    for rule in re.finditer(r'Rule\(\s*"([^"]+)",\s*"Bank Fees",(.*?)\n    \),', source, flags=re.S):
        wordings += re.findall(r"\"([A-Z0-9][A-Z0-9 /&\-\.']{2,})\"", rule.group(2))
    return [item for item in dict.fromkeys(wordings) if not item.startswith("DESCRIPTION")]


# Wordings that really are a product the customer chose. Anything else the categoriser
# files as a bank fee must never be raised as an optional charge just because it repeats.
GENUINELY_OPTIONAL = {"VITALITY MONEY PREMIUM"}


def test_no_ordinary_bank_fee_wording_is_ever_raised_as_an_optional_charge() -> None:
    wordings = _known_bank_fee_wordings()
    assert len(wordings) > 60, "the fee wordings could not be read from the categoriser"

    flagged = set()
    for wording in wordings:
        days = (date(2026, 4, 25), date(2026, 5, 25), date(2026, 6, 25))
        txs = [_tx(i, wording.title(), "59.00", day, categorisation=FEE) for i, day in enumerate(days)]
        if _optional_charges(txs):
            flagged.add(wording)

    assert flagged == GENUINELY_OPTIONAL, (
        "A bank-fee wording would be raised as an optional charge. If it is a product the "
        "customer chose, add it to GENUINELY_OPTIONAL; otherwise tighten the rule."
    )


def test_a_charge_that_varies_or_appears_once_is_not_a_recurring_choice() -> None:
    varying = [
        _tx(i, "Cashback Rewards Fee", amount, date(2026, 4 + i, 25), categorisation=FEE)
        for i, amount in enumerate(("59.00", "61.50", "58.00"))
    ]
    once = [_tx(0, "Cashback Rewards Fee", "59.00", date(2026, 4, 25), categorisation=FEE)]
    twice_in_a_month = [
        _tx(0, "Cashback Rewards Fee", "59.00", date(2026, 4, 5), categorisation=FEE),
        _tx(1, "Cashback Rewards Fee", "59.00", date(2026, 4, 25), categorisation=FEE),
    ]

    assert _optional_charges(varying) == []
    assert _optional_charges(once) == []
    assert _optional_charges(twice_in_a_month) == []
