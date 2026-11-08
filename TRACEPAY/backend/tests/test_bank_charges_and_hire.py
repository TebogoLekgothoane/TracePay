"""Bank-side monthly charges are bank fees, and a car-hire firm is not a landlord."""

from dataclasses import replace
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest

import categorisation.service as categorisation_service
from categorisation.merchant_memory import MerchantMemory
from categorisation.service import CategorisableTransaction, categorise_batch
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.statement_review import (
    StatementContext,
    _fee_breakdown,
    _implied_overdraft,
    _month_key,
    _optional_charges,
    payee_name,
)
from leak_intelligence.finding_questions import NOT_SURE, StoredAnswer
from leak_intelligence.review_bridge import _impact
from leak_intelligence.statement_review_answers import apply_answers, open_questions

CATALOGUE = ["Other", "Bank Fees", "Transport", "Housing", "Groceries"]


def _categorise(description: str, amount: str = "-100.00", kind: str = "debit") -> FeatureTransaction:
    def _no_ai(*_args, **_kwargs):
        raise AssertionError("A test tried to send statement lines to an AI provider.")

    with (
        patch.object(categorisation_service.settings, "ai_categorisation_enabled", False),
        patch.object(categorisation_service, "classify_batch", _no_ai),
    ):
        result = categorise_batch(
            [
                CategorisableTransaction(
                    transaction_id="t1",
                    description=description,
                    amount=Decimal(amount),
                    transaction_type=kind,
                    bank="discovery",
                )
            ],
            CATALOGUE,
            merchant_memory=MerchantMemory(),
        )["t1"]
    return FeatureTransaction(
        transaction_id="t1",
        user_id="user-a",
        amount=abs(Decimal(amount)),
        transaction_date=date(2026, 4, 4),
        description=description,
        merchant_name=result.merchant_name,
        transaction_type=kind,
        categorisation=result,
    )


@pytest.mark.parametrize("description", ["Monthly facility fee", "Vitality Money Premium"])
def test_bank_side_monthly_charges_are_bank_fees(description: str) -> None:
    tx = _categorise(description)

    assert tx.categorisation.transaction_class == "bank_fee"


def test_account_charges_are_named_not_called_payment_fees() -> None:
    charges = [
        _categorise("Monthly Account fee", "-435.00"),
        _categorise("Monthly facility fee", "-69.00"),
        _categorise("Vitality Money Premium", "-101.00"),
    ]

    finding, _rates = _fee_breakdown(charges, 1)

    assert finding is not None
    assert "Account charges Monthly Account fee R435" in finding.shows
    assert "Payment fees" not in finding.shows
    assert {row.role for row in finding.rows} == {"account charge"}


def _monthly(description: str, amount: str, *days: date) -> list[FeatureTransaction]:
    return [
        replace(_categorise(description, amount), transaction_id=f"{description}-{day}", transaction_date=day)
        for day in days
    ]


def test_the_vitality_premium_is_its_own_finding_not_a_bank_fee() -> None:
    days = (date(2026, 4, 4), date(2026, 5, 4), date(2026, 6, 4))
    txs = [
        *_monthly("Monthly Account fee", "-435.00", *days),
        *_monthly("Vitality Money Premium", "-101.00", *days),
    ]

    finding, _rates = _fee_breakdown(txs, 3)
    (premium,) = _optional_charges(txs)

    assert finding is not None and "Vitality" not in finding.shows
    assert finding.figures["total"] == Decimal("1305.00")
    assert premium is not None
    assert premium.key == "optional_charge:vitality-money-premium"
    assert premium.leak_type == "subscription_leak"
    assert premium.figures["amount"] == Decimal("101.00")
    assert premium.figures["total"] == Decimal("303.00")
    assert "Whether you get value" in premium.cannot_show
    assert len(premium.rows) == 3


def test_one_vitality_charge_is_not_a_pattern() -> None:
    assert _optional_charges(_monthly("Vitality Money Premium", "-101.00", date(2026, 4, 4))) == []


def test_the_premium_reaches_the_app_as_a_possible_monthly_cost() -> None:
    days = (date(2026, 4, 4), date(2026, 5, 4), date(2026, 6, 4))
    (premium,) = _optional_charges(_monthly("Vitality Money Premium", "-101.00", *days))

    monthly, annual, kind = _impact(premium, 3)

    assert (monthly, annual, kind) == (Decimal("101.00"), Decimal("1212.00"), "recurring")


def _vitality_finding():
    days = (date(2026, 4, 4), date(2026, 5, 4), date(2026, 6, 4))
    found = _optional_charges(_monthly("Vitality Money Premium", "-101.00", *days))
    return found[0] if found else None


def _answer(finding, value: str, status: str = "answered") -> dict:
    question = finding.questions[0]
    return {
        question.question_key: StoredAnswer(
            question_key=question.question_key,
            kind="subscription_usage",
            answer=value,
            signature=question.signature,
            status=status,  # type: ignore[arg-type]
            answered_at=datetime(2026, 11, 8, tzinfo=timezone.utc),
        )
    }


def test_the_vitality_finding_asks_whether_the_user_still_uses_it() -> None:
    finding = _vitality_finding()

    assert len(finding.questions) == 1
    question = finding.questions[0]
    assert question.kind == "subscription_usage"
    assert question.leak_id == "optional_charge:vitality-money-premium"
    assert "R101" in question.prompt and "Vitality Money Premium" in question.prompt
    assert {option.value for option in question.options} >= {"still_use", "rarely", "dont_use"}
    # Unanswered, the question is open and would be put to the user.
    assert open_questions([finding], {}) == [question.model_copy(update={"priority": 1.0})]


def test_still_using_vitality_dismisses_the_finding_and_closes_the_question() -> None:
    finding = _vitality_finding()
    answers = _answer(finding, "still_use")

    findings, notes = apply_answers([finding], answers)

    assert findings[0].status == "dismissed"
    assert notes == ["You told us you still use Vitality Money Premium, so it is not raised."]
    assert open_questions(findings, answers) == []


def test_rarely_using_vitality_keeps_the_finding_and_records_the_answer() -> None:
    finding = _vitality_finding()

    findings, notes = apply_answers([finding], _answer(finding, "rarely"))

    assert findings[0].status == "active"
    assert findings[0].reported == ["you rarely use Vitality Money Premium."]
    assert notes == []


def test_not_sure_and_skipped_change_nothing_but_a_skip_closes_the_question() -> None:
    finding = _vitality_finding()

    unsure, _ = apply_answers([finding], _answer(finding, NOT_SURE))
    assert unsure[0].status == "active" and unsure[0].reported == []

    skipped = _answer(finding, "still_use", status="skipped")
    kept, _ = apply_answers([finding], skipped)
    assert kept[0].status == "active"
    assert open_questions(kept, skipped) == []


def test_a_changed_premium_asks_again() -> None:
    finding = _vitality_finding()
    stale = _answer(finding, "still_use")
    only_key = next(iter(stale))
    stale[only_key] = stale[only_key].model_copy(update={"signature": "amt=70"})

    findings, _ = apply_answers([finding], stale)

    assert findings[0].status == "active"
    assert [q.question_key for q in open_questions(findings, stale)] == [only_key]


def test_a_payment_fee_is_still_called_one() -> None:
    fee = _categorise("Immediate payment fee", "-12.00")

    finding, _rates = _fee_breakdown([fee], 1)

    assert finding is not None and "Payment fees" in finding.shows


def test_interest_posted_as_two_lines_is_one_charge_for_the_implied_balance() -> None:
    main = _categorise("Interest charged at 16.25%", "-158.64")
    cents = _categorise("Interest Charged at 16.25%", "-0.02")
    main = replace(main, transaction_id="i1", transaction_date=date(2026, 5, 4))
    cents = replace(cents, transaction_id="i2", transaction_date=date(2026, 5, 4))
    ctx = StatementContext(debit_interest_rates={_month_key(date(2026, 5, 3)): Decimal("16.25")})

    finding = _implied_overdraft([main, cents], ctx, 1)

    assert finding is not None
    assert "posted as 2 lines" in finding.shows
    # The balance comes from the month's R158.66, about R12k, not from a R0.02 line (about R1).
    assert "R12–12k" in finding.shows
    assert "R0–" not in finding.shows


def test_car_hire_is_not_rent_but_a_landlord_still_is() -> None:
    hire = _categorise("Hertz Rent A Car", "-5630.00")
    landlord = _categorise("RENT - J SMITH", "-9000.00")

    assert payee_name(hire) == "Hertz Rent A Car"
    assert payee_name(landlord) == "Rent"
