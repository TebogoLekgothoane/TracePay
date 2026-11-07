"""The engine and the statement review as one list of findings."""

from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest

import app.leak_detection as leak_detection
from leak_intelligence.finding_questions import StoredAnswer
from leak_intelligence.leak_evidence import _redact
from leak_intelligence.leak_models import (
    LeakDetection,
    SupportingTransaction,
)
from leak_intelligence.review_bridge import SOURCE, SUPERSEDE_SHARE, _superseded_by
from tests.statement_review_helpers import investec_figure_rows, investec_inputs


def _detect(answers=None):
    inputs = investec_inputs()
    with (
        patch.object(leak_detection, "fetch_printed_figure_rows", lambda *_a: investec_figure_rows()),
        patch.object(leak_detection, "load_finding_answers", lambda *_a: {} if answers is None else answers),
    ):
        return leak_detection._detect_all(inputs, "user-a", "token")


@pytest.fixture(scope="module")
def detection():
    return _detect()


@pytest.fixture(scope="module")
def result(detection):
    return detection.result


def _review_leaks(result):
    return [leak for leak in result.leaks if leak.evidence.get("source") == SOURCE]


def _engine_leaks(result):
    return [leak for leak in result.leaks if leak.evidence.get("source") != SOURCE]


def _focus(result, focus):
    return next(leak for leak in _review_leaks(result) if leak.evidence["finding_focus"] == focus)


# ------------------------------------------------------------------------------ one list


def test_the_review_raises_what_the_engine_hid(result) -> None:
    types = {leak.leak_type for leak in _review_leaks(result)}
    assert {"duplicate_debit_order_leak", "duplicate_payment_leak"} <= types
    double = _focus(result, "double_debit")
    assert double.title == "Virgin Active charged double on 1 Oct"
    assert double.value_group == "recoverable"
    assert _focus(result, "paired").value_group == "recoverable"


def test_the_engine_no_longer_calls_the_double_debit_missed_months(result) -> None:
    # The engine said "most likely missed months billed together" and "a habit, not a double".
    reasons = {miss.reason_code for miss in result.near_misses}
    assert "multiple_of_regular_amount" not in reasons
    assert "repeated_routine" not in reasons


def test_other_near_misses_the_review_does_not_contradict_are_kept(result) -> None:
    kept = [m for m in result.near_misses if m.reason_code == "repeated_amount"]
    assert kept, "a routine purchase is still a routine purchase"


def test_what_the_review_covers_is_said_once(result) -> None:
    visible_titles = [leak.title for leak in result.leaks]
    # Three Apple subscriptions and the engine's fee guess give way to one finding each.
    assert not any(title.startswith("Apple subscription") for title in visible_titles)
    assert "Potential monthly banking fee increase" not in visible_titles
    assert "Bank fees, itemised" in visible_titles
    assert "Apple billing you may not recognise" in visible_titles
    replaced = {leak.title: leak.evidence.get("superseded_by_review") for leak in result.explained_leaks}
    assert replaced["Potential monthly banking fee increase"] == "bank_fees"
    assert sum(1 for t in replaced if t.startswith("Apple subscription")) == 3
    assert all(
        leak.evidence["redundant_for_display"] and leak.evidence["explained_by_leak_ids"]
        for leak in result.explained_leaks
        if leak.evidence.get("superseded_by_review")
    )


def test_what_the_review_does_not_cover_stays(result) -> None:
    kept_types = {leak.leak_type for leak in _engine_leaks(result)}
    assert "payday_spending_leak" in kept_types  # a pattern the review has no rule for
    engine_titles = [leak.title for leak in _engine_leaks(result)]
    assert "Virgin Active subscription — R835 recurring monthly payment" in engine_titles
    # Payments the review calls commitments are still put to the user as "what is this?".
    assert sum(1 for t in engine_titles if "unidentified" in t.lower()) >= 3


def test_the_price_that_fell_is_good_news_not_a_finding(result) -> None:
    assert [item.title for item in result.good_news] == ["Pineapple dropped from R1,054.66 to R676.23"]
    assert not any("Pineapple dropped" in leak.title for leak in result.leaks)
    assert all(leak.value_group in {"recoverable", "review", "commitment"} for leak in result.leaks)


# ------------------------------------------------------------------------------ the converted findings


def test_a_converted_finding_keeps_the_reviews_own_words(result) -> None:
    double = _focus(result, "double_debit")
    assert double.claims is not None
    assert double.claims.confirmed[0].text == (
        "R835 was debited on the 1st of every month from June to September. "
        "On 1 Oct it was R1,670, exactly 2×."
    )
    assert "A catch-up payment is unlikely" in double.claims.possible[0].text
    assert "ask Virgin Active for the October debit-order breakdown" in double.claims.possible[0].check


def test_a_converted_finding_carries_the_exact_rows_behind_it(result) -> None:
    double = _focus(result, "double_debit")
    assert double.supporting_transaction_count == 5
    assert [row.amount for row in double.supporting_transactions][-1] == Decimal("1670.00")
    paired = _focus(result, "paired")
    assert paired.supporting_transaction_count == 12
    assert double.evidence["transaction_evidence"] == "attached"


def test_rows_are_redacted_like_every_other_row_the_engine_returns(result) -> None:
    for leak in _review_leaks(result):
        for row in leak.supporting_transactions:
            assert isinstance(row, SupportingTransaction)
    pineapple = _focus(result, "insurers")
    raw = next(
        t.description for t in investec_inputs().transactions if t.description.startswith("PINEAPPLE")
    )
    assert any(row.description == _redact(raw) for row in pineapple.supporting_transactions)


def test_every_converted_finding_is_a_valid_engine_finding(result) -> None:
    ids = [leak.leak_id for leak in result.leaks]
    assert len(ids) == len(set(ids))
    for leak in _review_leaks(result):
        assert leak.detector_version == "review-1"
        assert leak.claims is not None and leak.claims.confirmed
        assert leak.analysis is not None  # the engine's enrichment ran on it
        assert leak.estimated_monthly_impact >= 0
    result.model_dump(mode="json")  # the contract the API serialises


def test_amounts_come_from_the_rows_not_from_the_wording(result) -> None:
    assert _focus(result, "double_debit").estimated_monthly_impact == Decimal("835.00")
    assert _focus(result, "double_debit").impact_kind == "one_time"
    assert _focus(result, "paired").estimated_monthly_impact == Decimal("974.94")
    assert _focus(result, "price_rise").estimated_monthly_impact == Decimal("135.72")
    assert _focus(result, "price_rise").estimated_annual_impact == Decimal("1628.64")
    assert _focus(result, "bank_fees").estimated_monthly_impact == Decimal("768.51")
    assert _focus(result, "overdraft_interest").estimated_monthly_impact == Decimal("413.09")
    # A pattern worth knowing about makes no cost claim.
    assert _focus(result, "round_trip_transfers").estimated_monthly_impact == 0


# ------------------------------------------------------------------------------ nothing replaced by name


def _leak(leak_type: str, ids: list[str]) -> LeakDetection:
    return LeakDetection(
        leak_id="a" * 32,
        fingerprint="a" * 32,
        leak_type=leak_type,  # type: ignore[arg-type]
        title="t",
        description="d",
        severity="low",
        confidence=0.7,
        estimated_monthly_impact=Decimal("1"),
        impact_kind="recurring",
        supporting_transactions=[
            SupportingTransaction(
                transaction_id=i, date=date(2026, 6, 1), description="x", amount=Decimal("1"),
                direction="debit", role="payment",
            )
            for i in ids
        ],
        detector_version="1.0",
        detected_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )


def test_an_engine_finding_is_replaced_only_by_the_same_kind_on_the_same_rows() -> None:
    review = [_leak("subscription_leak", ["1", "2", "3", "4"])]
    assert _superseded_by(_leak("recurring_payment_leak", ["1", "2"]), review) is review[0]
    assert SUPERSEDE_SHARE == Decimal("0.5")
    # Half the rows is enough; less is not.
    assert _superseded_by(_leak("recurring_payment_leak", ["1", "9"]), review) is review[0]
    assert _superseded_by(_leak("recurring_payment_leak", ["1", "8", "9"]), review) is None
    # A different kind of finding is never replaced, however much it shares.
    assert _superseded_by(_leak("food_spending_leak", ["1", "2"]), review) is None
    # No rows, nothing to compare.
    assert _superseded_by(_leak("subscription_leak", []), review) is None


# ------------------------------------------------------------------------------ questions


def test_the_question_with_money_at_stake_is_asked_first(result) -> None:
    assert [(q.kind, q.subject) for q in result.questions] == [
        ("duplicate_expected", "Apple"),
        ("cancelled_in", "Apple"),
        ("payment_purpose", result.questions[2].subject),
    ]
    assert result.questions_not_shown == 10


def test_a_question_both_sources_ask_is_asked_once(result) -> None:
    keys = [q.question_key for q in result.questions]
    assert len(keys) == len(set(keys))


def test_an_answer_reaches_the_merged_findings() -> None:
    first = _detect()
    question = next(q for q in first.result.questions if q.kind == "duplicate_expected")
    answers = {
        question.question_key: StoredAnswer(
            question_key=question.question_key,
            kind="duplicate_expected",
            answer="one_unexpected",
            signature=question.signature,
            answered_at=datetime(2026, 11, 8, tzinfo=timezone.utc),
        )
    }
    second = _detect(answers)
    paired = _focus(second.result, "paired")
    assert [item.text for item in paired.claims.reported] == ["You told us: One of the payments was unexpected."]
    assert all(q.kind != "duplicate_expected" for q in second.result.questions)
    # And "both expected" removes the finding altogether.
    answers[question.question_key] = answers[question.question_key].model_copy(update={"answer": "both_expected"})
    third = _detect(answers)
    assert not [leak for leak in _review_leaks(third.result) if leak.evidence["finding_focus"] == "paired"]


def test_when_answers_cannot_be_read_nothing_is_asked() -> None:
    inputs = investec_inputs()

    def unreadable(*_args):
        raise RuntimeError("boom")

    with (
        patch.object(leak_detection, "fetch_printed_figure_rows", lambda *_a: investec_figure_rows()),
        patch.object(leak_detection, "load_finding_answers", unreadable),
    ):
        detection = leak_detection._detect_all(inputs, "user-a", "token")
    assert detection.result.questions == []
    assert any(leak.evidence.get("source") == SOURCE for leak in detection.result.leaks)  # findings unaffected
