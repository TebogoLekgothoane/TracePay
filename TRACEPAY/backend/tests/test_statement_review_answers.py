from datetime import datetime, timezone

import pytest

from leak_intelligence.finding_questions import StoredAnswer, is_valid_answer, parse_question_key
from leak_intelligence.statement_review import build_statement_review
from leak_intelligence.statement_review_render import render_statement_review
from tests.statement_review_helpers import investec_context, investec_transactions


@pytest.fixture(scope="module")
def transactions():
    return investec_transactions()


@pytest.fixture(scope="module")
def context():
    return investec_context()


def _review(transactions, context, answers=None, **kwargs):
    return build_statement_review(transactions, context, answers, **kwargs)


def _key(review, kind, subject=None):
    matches = [
        q for q in review.questions if q.kind == kind and (subject is None or q.subject == subject)
    ]
    assert matches, f"no open {kind} question for {subject}"
    return matches[0]


def _answer(question, value, status="answered", signature=None):
    return StoredAnswer(
        question_key=question.question_key,
        kind=question.kind,
        answer=value,
        signature=question.signature if signature is None else signature,
        status=status,
        answered_at=datetime(2026, 11, 8, tzinfo=timezone.utc),
    )


def _with(review_questions, *pairs):
    return {q.question_key: _answer(q, value) for q, value in pairs}


# ---------------------------------------------------------------------------- the questions themselves


def test_every_question_is_one_the_answer_endpoints_accept(transactions, context) -> None:
    review = _review(transactions, context)
    assert {q.kind for q in review.questions} == {
        "duplicate_expected",
        "cancelled_in",
        "payment_purpose",
        "insurance_cover",
        "transfer_purpose",
        "subscription_usage",
        "one_off_expected",
        "spending_level",
    }
    for question in review.questions:
        parsed = parse_question_key(question.question_key)
        assert parsed is not None and parsed[0] == question.kind, question.question_key
        assert question.options[-1].value == "not_sure"
        for option in question.options:
            assert is_valid_answer(question.kind, option.value), (question.kind, option.value)


def test_insurers_and_cloud_services_are_asked_one_at_a_time(transactions, context) -> None:
    review = _review(transactions, context)
    insurers = [q.subject for q in review.questions if q.kind == "insurance_cover"]
    assert insurers == ["Dotsure", "Pineapple", "Outsurance"]
    usage = [q.subject for q in review.questions if q.kind == "subscription_usage"]
    assert usage == ["Google One", "Microsoft"]


def test_only_a_few_questions_are_put_to_the_user_at_once(transactions, context) -> None:
    review = _review(transactions, context)
    assert len(review.questions) == 11
    assert [q.kind for q in review.pending_questions] == [
        "duplicate_expected",
        "cancelled_in",
        "payment_purpose",
    ]
    assert review.questions_not_shown == 8


def test_no_more_than_two_of_one_kind_are_pending(transactions, context) -> None:
    review = _review(transactions, context)
    answers = {
        q.question_key: _answer(q, "not_sure")
        for q in review.questions
        if q.kind in {"duplicate_expected", "cancelled_in", "payment_purpose"}
    }
    pending = _review(transactions, context, answers).pending_questions
    assert [q.kind for q in pending] == ["insurance_cover", "insurance_cover", "transfer_purpose"]


def test_the_cancel_month_options_run_from_before_the_first_statement(transactions, context) -> None:
    question = _key(_review(transactions, context), "cancelled_in")
    values = [option.value for option in question.options]
    assert values == ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "not_sure"]


# ---------------------------------------------------------------------------- answers change the review


def test_both_charges_expected_sets_the_pair_aside_and_says_why(transactions, context) -> None:
    base = _review(transactions, context)
    question = _key(base, "duplicate_expected")
    review = _review(transactions, context, {question.question_key: _answer(question, "both_expected")})
    assert [f.key for f in review.by_group("recoverable")] == ["double_debit:Virgin Active"]
    text = render_statement_review(review)
    assert "Apple charged the same amounts twice" not in text
    assert "You told us both Apple charges were expected" in text
    assert "Counts: **1 potentially recoverable" in text
    assert all(q.kind != "duplicate_expected" for q in review.questions)


def test_one_unexpected_keeps_the_finding_and_records_what_was_said(transactions, context) -> None:
    question = _key(_review(transactions, context), "duplicate_expected")
    review = _review(transactions, context, {question.question_key: _answer(question, "one_unexpected")})
    text = render_statement_review(review)
    assert "Apple charged the same amounts twice" in text
    assert "- **You told us:** One of the payments was unexpected." in text


def test_a_refund_resolves_the_pair(transactions, context) -> None:
    question = _key(_review(transactions, context), "duplicate_expected")
    review = _review(transactions, context, {question.question_key: _answer(question, "one_refunded")})
    assert "paired:Apple" not in {f.key for f in review.by_group("recoverable")}
    assert any("was refunded" in note for note in review.near_misses)


def test_cancelling_before_the_last_charge_shows_the_charges_after_it(transactions, context) -> None:
    question = _key(_review(transactions, context), "cancelled_in")
    review = _review(transactions, context, {question.question_key: _answer(question, "2026-06")})
    text = render_statement_review(review)
    assert "You told us:** You cancelled them in Jun 2026." in text
    # Jul 5, 17, 25 and Aug 5, 25, 25: R343.98 x2, R579 x2 and R1,889.99 x2.
    assert "6 charges of those amounts after Jun 2026, R5,625.94 in all" in text


def test_cancelling_when_they_stopped_is_consistent_with_the_rows(transactions, context) -> None:
    question = _key(_review(transactions, context), "cancelled_in")
    review = _review(transactions, context, {question.question_key: _answer(question, "2026-08")})
    assert "no charges of those amounts after Aug 2026" in render_statement_review(review)


def test_savings_answer_removes_the_unknown_merchant(transactions, context) -> None:
    question = _key(_review(transactions, context), "payment_purpose")
    review = _review(transactions, context, {question.question_key: _answer(question, "savings")})
    text = render_statement_review(review)
    assert "Unknown recurring merchant" not in text
    assert "You told us PROPUP is savings or an investment, so it is not raised." in text
    assert all(q.kind != "payment_purpose" for q in review.questions)


def test_another_purpose_keeps_it_and_names_what_it_is(transactions, context) -> None:
    question = _key(_review(transactions, context), "payment_purpose")
    review = _review(transactions, context, {question.question_key: _answer(question, "membership")})
    text = render_statement_review(review)
    assert "Unknown recurring merchant" in text
    assert "**You told us:** This is a subscription or membership." in text


def test_three_different_covers_set_the_insurers_aside(transactions, context) -> None:
    base = _review(transactions, context)
    covers = {"Dotsure": "car", "Pineapple": "household", "Outsurance": "life"}
    answers = {
        q.question_key: _answer(q, covers[q.subject])
        for q in base.questions
        if q.kind == "insurance_cover"
    }
    review = _review(transactions, context, answers)
    text = render_statement_review(review)
    assert "Three insurers" not in text
    assert (
        "You told us Dotsure, Pineapple and Outsurance cover different things "
        "(car, household and life), so overlapping cover is not raised."
    ) in text


def test_two_policies_covering_the_same_thing_are_named(transactions, context) -> None:
    base = _review(transactions, context)
    covers = {"Dotsure": "car", "Pineapple": "car"}
    answers = {
        q.question_key: _answer(q, covers[q.subject])
        for q in base.questions
        if q.kind == "insurance_cover" and q.subject in covers
    }
    text = render_statement_review(_review(transactions, context, answers))
    assert "Three insurers" in text
    assert "Dotsure and Pineapple both cover car." in text
    # One insurer is still unanswered, so it is still asked about.
    assert "What does your Outsurance policy cover?" in text


def test_a_transfer_answer_is_recorded_without_changing_the_rows(transactions, context) -> None:
    question = _key(_review(transactions, context), "transfer_purpose")
    review = _review(transactions, context, {question.question_key: _answer(question, "moved_back")})
    text = render_statement_review(review)
    assert "**You told us:** This is a budgeting move you reverse on purpose." in text
    assert "R10,000 (Jun), R15,900 (Aug), R27,000 (Sep), R17,000 (Oct)" in text


def test_usage_answers_are_recorded_per_service(transactions, context) -> None:
    base = _review(transactions, context)
    google = _key(base, "subscription_usage", "Google One")
    microsoft = _key(base, "subscription_usage", "Microsoft")
    review = _review(
        transactions, context, {
            google.question_key: _answer(google, "rarely"),
            microsoft.question_key: _answer(microsoft, "still_use"),
        },
    )
    text = render_statement_review(review)
    assert "**You told us:** You rarely use Google One. You still use Microsoft." in text


# ---------------------------------------------------------------------------- what an answer never does


def test_not_sure_changes_nothing_but_closes_the_question(transactions, context) -> None:
    base = _review(transactions, context)
    question = _key(base, "duplicate_expected")
    review = _review(transactions, context, {question.question_key: _answer(question, "not_sure")})
    assert "You told us" not in render_statement_review(review)
    assert "paired:Apple" in {f.key for f in review.by_group("recoverable")}
    assert all(q.kind != "duplicate_expected" for q in review.questions)


def test_a_skip_changes_nothing_and_is_not_asked_again(transactions, context) -> None:
    question = _key(_review(transactions, context), "payment_purpose")
    skipped = _answer(question, "skipped", status="skipped")
    review = _review(transactions, context, {question.question_key: skipped})
    assert "Unknown recurring merchant" in render_statement_review(review)
    assert all(q.kind != "payment_purpose" for q in review.questions)


def test_an_answer_about_an_older_price_no_longer_applies(transactions, context) -> None:
    question = _key(_review(transactions, context), "payment_purpose")
    stale = _answer(question, "savings", signature="amt=50")  # the payment is R99 now
    review = _review(transactions, context, {question.question_key: stale})
    assert "Unknown recurring merchant" in render_statement_review(review)
    assert any(q.kind == "payment_purpose" for q in review.questions)


def test_answers_never_change_the_statement_facts(transactions, context) -> None:
    base = _review(transactions, context)
    answers = {q.question_key: _answer(q, "not_sure") for q in base.questions}
    answers[_key(base, "payment_purpose").question_key] = _answer(_key(base, "payment_purpose"), "membership")
    changed = _review(transactions, context, answers)
    for before, after in zip(base.findings, changed.findings):
        assert (before.confirmed, before.shows, before.figures) == (after.confirmed, after.shows, after.figures)


def test_unreadable_answers_ask_nothing(transactions, context) -> None:
    review = _review(transactions, context, None, ask_questions=False)
    assert review.questions == [] and review.pending_questions == []
    text = render_statement_review(review)
    assert "Questions are not shown because your earlier answers could not be read." in text
    # The findings themselves are unaffected.
    assert "Virgin Active charged double" in text


def test_with_every_question_answered_the_section_says_so(transactions, context) -> None:
    base = _review(transactions, context)
    answers = {q.question_key: _answer(q, "not_sure") for q in base.questions}
    text = render_statement_review(_review(transactions, context, answers))
    assert "No questions: nothing here depends on an answer from you." in text
