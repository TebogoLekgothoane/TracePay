"""Uber Eats and one large charge each ask the user, and the answers shape the finding."""

from dataclasses import replace
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from categorisation.models import CategorisationResult
from leak_intelligence.finding_questions import NOT_SURE, StoredAnswer
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.statement_review import _delivery_habit, _large_one_off, _series_by_payee
from leak_intelligence.statement_review_answers import apply_answers, open_questions

SPENDING = CategorisationResult(
    category_name="Fast Food",
    category_confidence=0.9,
    rule="test",
    transaction_class="spending",
    classification_confidence=0.9,
    classification_reason="test",
)


def _tx(index: int, description: str, amount: str, day: date) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=f"t{index}",
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=day,
        description=description,
        transaction_type="debit",
        categorisation=SPENDING,
    )


def _delivery() -> list[FeatureTransaction]:
    quiet = [_tx(i, "UBER EATS JOHANNESBURG", "100.00", date(2026, 3, 1 + i)) for i in range(4)]
    busy = [_tx(10 + i, "DL UBER CPT ZA", "300.00", date(2026, 4, 1 + i)) for i in range(7)]
    return [*quiet, *busy]


def _one_off() -> list[FeatureTransaction]:
    others = [
        _tx(i, f"SHOP {i}", "150.00", date(2026, 3, 1 + i)) for i in range(6)
    ]
    big = _tx(99, "Hertz Rent A Car", "5630.00", date(2026, 3, 6))
    return [*others, big]


def _answer(finding, kind: str, value: str, status: str = "answered") -> dict:
    question = finding.questions[0]
    return {
        question.question_key: StoredAnswer(
            question_key=question.question_key,
            kind=kind,  # type: ignore[arg-type]
            answer=value,
            signature=question.signature,
            status=status,  # type: ignore[arg-type]
            answered_at=datetime(2026, 11, 8, tzinfo=timezone.utc),
        )
    }


def _food():
    return _delivery_habit(_delivery())


def _large():
    txs = _one_off()
    return _large_one_off(txs, _series_by_payee(txs))


def test_uber_eats_asks_whether_the_level_is_usual() -> None:
    finding = _food()

    assert finding is not None and len(finding.questions) == 1
    question = finding.questions[0]
    assert question.kind == "spending_level"
    assert "Uber Eats" in question.prompt and "usually spend" in question.prompt
    assert {o.value for o in question.options} >= {"usual", "more_than_usual", "one_off_reason", "want_less"}
    assert [q.question_key for q in open_questions([finding], {})] == [question.question_key]


def test_a_usual_level_dismisses_uber_eats() -> None:
    finding = _food()
    answers = _answer(finding, "spending_level", "usual")

    findings, notes = apply_answers([finding], answers)

    assert findings[0].status == "dismissed"
    assert notes == ["You told us Uber Eats is about what you usually spend, so it is not raised."]
    assert open_questions(findings, answers) == []


@pytest.mark.parametrize(
    ("value", "text"),
    [
        ("more_than_usual", "Uber Eats is more than you usually spend."),
        ("one_off_reason", "the Uber Eats spending was a one-off stretch, such as a trip, an event or guests."),
        ("want_less", "you want to spend less on Uber Eats."),
    ],
)
def test_other_spending_answers_keep_the_finding_and_record_what_was_said(value: str, text: str) -> None:
    finding = _food()

    findings, notes = apply_answers([finding], _answer(finding, "spending_level", value))

    assert findings[0].status == "active"
    assert findings[0].reported == [text]
    assert notes == []


def test_the_large_charge_asks_whether_it_was_planned() -> None:
    finding = _large()

    assert finding is not None and len(finding.questions) == 1
    question = finding.questions[0]
    assert question.kind == "one_off_expected"
    assert "Hertz Rent A Car" in question.prompt and "R5,630" in question.prompt
    assert {o.value for o in question.options} >= {"planned", "unplanned", "refunded", "not_mine"}


def test_planned_and_refunded_set_the_large_charge_aside() -> None:
    finding = _large()

    planned, planned_notes = apply_answers([finding], _answer(finding, "one_off_expected", "planned"))
    refunded, refunded_notes = apply_answers([_large()], _answer(finding, "one_off_expected", "refunded"))

    assert planned[0].status == "dismissed"
    assert planned_notes == ["You told us the R5,630 Hertz Rent A Car charge was planned, so it is not raised."]
    assert refunded[0].status == "resolved"
    assert refunded_notes == ["You told us the R5,630 Hertz Rent A Car charge was refunded, so it is not raised."]


@pytest.mark.parametrize(
    ("value", "text"),
    [
        ("unplanned", "the R5,630 Hertz Rent A Car charge was unplanned."),
        ("not_mine", "you don't recognise the R5,630 Hertz Rent A Car charge."),
    ],
)
def test_unplanned_or_unrecognised_keeps_the_large_charge(value: str, text: str) -> None:
    finding = _large()

    findings, notes = apply_answers([finding], _answer(finding, "one_off_expected", value))

    assert findings[0].status == "active"
    assert findings[0].reported == [text]
    assert notes == []


def test_not_sure_changes_nothing_and_a_much_bigger_charge_asks_again() -> None:
    finding = _large()

    unsure, _ = apply_answers([finding], _answer(finding, "one_off_expected", NOT_SURE))
    assert unsure[0].status == "active" and unsure[0].reported == []

    stale = _answer(finding, "one_off_expected", "planned")
    key = next(iter(stale))
    stale[key] = stale[key].model_copy(update={"signature": "amt=3000"})
    findings, _ = apply_answers([finding], stale)

    assert findings[0].status == "active"
    assert [q.question_key for q in open_questions(findings, stale)] == [key]
