"""Targeted questions: asked only when an answer could change a finding, then applied honestly."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app import finding_answers, finding_registry, leak_detection
from leak_intelligence.finding_questions import (
    MAX_PENDING,
    MAX_PER_KIND,
    StoredAnswer,
    apply_answers,
    attach_questions,
    is_valid_answer,
    latest_answers,
    parse_question_key,
    select_questions,
)
from leak_intelligence.leak_claims import attach_claims
from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.leak_models import LeakDetectionResult
from tests.test_detection_rules_and_claims import _gym_with_second_collection, _monthly, _run, _statement

NOW = datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc)


def _detect(transactions) -> LeakDetectionResult:
    from leak_intelligence.behaviour_engine import analyze_behaviour
    from leak_intelligence.engine import build_financial_features
    from leak_intelligence.leak_engine import detect_leaks

    snapshot = build_financial_features(transactions[0].user_id, transactions)
    result = detect_leaks(snapshot, analyze_behaviour(snapshot))
    return attach_claims(attach_supporting_transactions(result, transactions))


def _answer(
    kind: str,
    subject: str,
    answer: str,
    *,
    signature: str = "",
    status: str = "answered",
    minutes: int = 0,
) -> dict[str, StoredAnswer]:
    key = f"{kind}:{subject}"
    return {
        key: StoredAnswer(
            question_key=key,
            kind=kind,  # type: ignore[arg-type]
            answer=answer,
            signature=signature,
            status=status,  # type: ignore[arg-type]
            answered_at=NOW + timedelta(minutes=minutes),
        )
    }


@pytest.fixture(scope="module")
def netflix_result() -> LeakDetectionResult:
    extra = _monthly(14, (2026, 2), 8, "NETFLIX.COM", "99")
    return _detect(_statement((2026, 1), 9, extra))


def _leak(result: LeakDetectionResult, leak_type: str):
    return next(item for item in result.leaks if item.leak_type == leak_type)


# ------------------------------------------------------------------- selection


def test_a_subscription_finding_asks_one_question_with_not_sure_and_skip(netflix_result) -> None:
    questions, not_shown = select_questions(netflix_result.leaks, {})
    assert [item.question_key for item in questions] == ["subscription_usage:netflix"]
    question = questions[0]
    assert question.prompt == "You paid R99 to Netflix. Do you still use it?"
    assert [option.label for option in question.options] == [
        "Still use it",
        "Rarely use it",
        "Don't use it",
        "Already cancelled",
        "Don't recognise it",
        "Not sure",
    ]
    assert question.can_skip is True
    assert question.context and "Netflix" in question.context[0]
    assert not_shown == 0


def test_a_finding_no_answer_could_change_asks_nothing() -> None:
    days = [2, 6, 9, 14, 20, 27]
    extra = [(date(2026, month, day), "ATM BALANCE ENQUIRY", "3.50") for month in (7, 8, 9) for day in days]
    result = _detect(_statement((2026, 7), 3, extra))
    assert any(item.leak_type == "bank_fee_leak" for item in result.leaks)
    assert select_questions(result.leaks, {})[0] == []


def test_the_bank_account_question_waits_for_verified_pricing_data() -> None:
    extra = _monthly(28, (2026, 1), 9, "MONTHLY ACCOUNT FEE", "165")
    result = _detect(_statement((2026, 1), 9, extra))
    assert select_questions(result.leaks, {})[0] == []
    asked, _ = select_questions(result.leaks, {}, reference_data=frozenset({"bank_fee_schedule"}))
    assert [item.question_key for item in asked] == ["bank_account:profile"]
    answered = _answer("bank_account", "profile", "fnb")
    assert select_questions(result.leaks, answered, reference_data=frozenset({"bank_fee_schedule"}))[0] == []


def test_fifteen_subscriptions_ask_only_about_the_strongest_few() -> None:
    names = [
        "NETFLIX", "SPOTIFY", "SHOWMAX", "ADOBE", "CANVA", "DROPBOX", "ICLOUD", "NORDVPN",
        "DUOLINGO", "DISNEY PLUS", "APPLE MUSIC", "YOUTUBE PREMIUM", "GITHUB", "AUDIBLE", "DEEZER",
    ]
    extra = []
    for index, name in enumerate(names):
        extra += _monthly(3 + index, (2026, 1), 9, name, str(50 + index * 10))
    result = _detect(_statement((2026, 1), 9, extra))
    subscriptions = [item for item in result.leaks if item.leak_type == "subscription_leak"]
    assert len(subscriptions) >= 12
    questions, not_shown = select_questions(result.leaks, {})
    # Many of one kind: only the strongest few are asked now, the rest wait.
    assert [item.kind for item in questions] == ["subscription_usage"] * MAX_PER_KIND
    assert not_shown >= len(subscriptions) - MAX_PER_KIND
    asked = {item.question_key for item in questions}
    by_price = sorted(subscriptions, key=lambda item: item.estimated_monthly_impact, reverse=True)
    assert asked == {f"subscription_usage:{item.evidence['merchant_key'].lower().replace(' ', '-')}" for item in by_price[:MAX_PER_KIND]}
    assert [item.priority for item in questions] == sorted((item.priority for item in questions), reverse=True)


def test_no_more_than_two_questions_of_one_kind_are_shown() -> None:
    names = ["NETFLIX", "SPOTIFY", "SHOWMAX", "ADOBE"]
    extra = []
    for index, name in enumerate(names):
        extra += _monthly(3 + index, (2026, 1), 9, name, str(80 + index * 10))
    result = _detect(_statement((2026, 1), 9, extra))
    questions, not_shown = select_questions(result.leaks, {})
    assert len(questions) == 2
    assert not_shown >= 1


# ------------------------------------------------------------- not asking twice


def test_an_answered_question_is_not_asked_again(netflix_result) -> None:
    answers = _answer("subscription_usage", "netflix", "rarely", signature="amt=99")
    assert select_questions(netflix_result.leaks, answers)[0] == []


def test_a_skipped_question_is_not_asked_again(netflix_result) -> None:
    answers = _answer("subscription_usage", "netflix", "skipped", signature="amt=99", status="skipped")
    assert select_questions(netflix_result.leaks, answers)[0] == []


def test_not_sure_is_an_answer_and_is_not_asked_again_either(netflix_result) -> None:
    answers = _answer("subscription_usage", "netflix", "not_sure", signature="amt=99")
    assert select_questions(netflix_result.leaks, answers)[0] == []
    assert apply_answers(netflix_result, answers).leaks == netflix_result.leaks


def test_a_price_rise_reopens_an_answered_question(netflix_result) -> None:
    answers = _answer("subscription_usage", "netflix", "still_use", signature="amt=79")
    questions, _ = select_questions(netflix_result.leaks, answers)
    assert [item.question_key for item in questions] == ["subscription_usage:netflix"]


def test_a_small_price_change_does_not_reopen_it(netflix_result) -> None:
    answers = _answer("subscription_usage", "netflix", "still_use", signature="amt=95")
    assert select_questions(netflix_result.leaks, answers)[0] == []


def test_the_newest_row_wins_when_a_question_is_answered_twice() -> None:
    old = _answer("subscription_usage", "netflix", "still_use", minutes=0)
    new = _answer("subscription_usage", "netflix", "dont_use", minutes=5)
    merged = latest_answers([*old.values(), *new.values()])
    assert merged["subscription_usage:netflix"].answer == "dont_use"


# ----------------------------------------------------------------- subscriptions


@pytest.mark.parametrize(
    ("answer", "effect"),
    [
        ("still_use", "weakens"),
        ("rarely", "strengthens"),
        ("dont_use", "strengthens"),
        ("not_recognised", "strengthens"),
    ],
)
def test_usage_answers_move_the_finding_without_touching_the_statement_facts(
    netflix_result, answer: str, effect: str
) -> None:
    before = _leak(netflix_result, "subscription_leak")
    answers = _answer("subscription_usage", "netflix", answer, signature="amt=99")
    after = _leak(apply_answers(netflix_result, answers), "subscription_leak")
    assert after.claims.user_effect == effect
    assert after.claims.confirmed == before.claims.confirmed
    assert after.confidence == before.confidence
    assert after.estimated_monthly_impact == before.estimated_monthly_impact
    assert after.claims.reported[0].answer == answer
    assert all(item.cannot_see for item in after.claims.possible)
    if answer == "still_use":
        assert not any("no longer use" in item.text for item in after.claims.possible)


def test_rarely_using_something_is_not_called_waste(netflix_result) -> None:
    answers = _answer("subscription_usage", "netflix", "rarely", signature="amt=99")
    after = _leak(apply_answers(netflix_result, answers), "subscription_leak")
    text = " ".join(item.text for item in after.claims.possible).lower()
    assert "waste" not in text
    assert "may not be getting enough" in text


def test_saying_cancelled_asks_when_and_it_comes_first(netflix_result) -> None:
    answers = _answer("subscription_usage", "netflix", "cancelled", signature="amt=99")
    questions, _ = select_questions(netflix_result.leaks, answers)
    assert questions[0].question_key == "cancelled_in:netflix"
    labels = [option.label for option in questions[0].options]
    assert labels[0] == "Before Feb 2026"
    assert labels[1:3] == ["Feb 2026", "Mar 2026"]
    assert labels[-1] == "Not sure"
    assert "Sep 2026" not in labels  # cancelling in the last payment month leaves nothing to count


def test_payments_after_the_month_they_cancelled_are_counted_from_the_statements(netflix_result) -> None:
    answers = {
        **_answer("subscription_usage", "netflix", "cancelled", signature="amt=99"),
        **_answer("cancelled_in", "netflix", "2026-04", minutes=1),
    }
    after = _leak(apply_answers(netflix_result, answers), "subscription_leak")
    fact = after.claims.confirmed[-1]
    assert fact.text == "Your statements show 5 payments after Apr 2026, R495 in all, the latest on 14 Sep 2026."
    assert fact.figures["count"] == 5
    assert after.claims.user_effect == "strengthens"
    assert after.claims.possible[0].text == "You may still be paying for a service you cancelled."
    assert any("cancellation went through" in line for line in after.claims.possible[0].cannot_see)
    assert [item.answer for item in after.claims.reported] == ["cancelled", "2026-04"]
    questions, _ = select_questions(apply_answers(netflix_result, answers).leaks, answers)
    assert all(item.question_key != "cancelled_in:netflix" for item in questions)


def test_cancelled_with_no_later_payments_resolves_the_finding(netflix_result) -> None:
    answers = {
        **_answer("subscription_usage", "netflix", "cancelled", signature="amt=99"),
        **_answer("cancelled_in", "netflix", "2026-09", minutes=1),
    }
    after = _leak(apply_answers(netflix_result, answers), "subscription_leak")
    assert after.status == "resolved"
    assert after.claims.user_effect == "resolves"
    assert after.claims.confirmed[-1].text == "Your statements show no payments after Sep 2026."
    assert select_questions(apply_answers(netflix_result, answers).leaks, answers)[0] == []


def test_cancelled_without_a_month_only_warns_conditionally(netflix_result) -> None:
    answers = {
        **_answer("subscription_usage", "netflix", "cancelled", signature="amt=99"),
        **_answer("cancelled_in", "netflix", "not_sure", minutes=1),
    }
    after = _leak(apply_answers(netflix_result, answers), "subscription_leak")
    assert after.claims.user_effect == "none"
    assert after.claims.possible[0].text.startswith("If you cancelled before the most recent payment")


def test_an_answer_about_an_older_price_is_ignored(netflix_result) -> None:
    answers = _answer("subscription_usage", "netflix", "dont_use", signature="amt=50")
    after = _leak(apply_answers(netflix_result, answers), "subscription_leak")
    assert after.claims.user_effect == "none"
    assert after.claims.reported == []


# -------------------------------------------------------------------- duplicates


@pytest.fixture(scope="module")
def duplicate_result() -> LeakDetectionResult:
    return _detect(_gym_with_second_collection(6))


def test_a_duplicate_finding_asks_whether_both_payments_were_expected(duplicate_result) -> None:
    questions, _ = select_questions(duplicate_result.leaks, {})
    assert questions[0].prompt == "You were charged R325 twice by Planet Fitness. Were all of those payments expected?"
    assert [option.value for option in questions[0].options] == [
        "both_expected", "one_unexpected", "one_refunded", "not_sure",
    ]


@pytest.mark.parametrize(
    ("answer", "status", "effect"),
    [
        ("both_expected", "dismissed", "resolves"),
        ("one_refunded", "resolved", "resolves"),
        ("one_unexpected", "active", "strengthens"),
    ],
)
def test_duplicate_answers(duplicate_result, answer: str, status: str, effect: str) -> None:
    signature = f"d={_leak(duplicate_result, 'duplicate_debit_order_leak').evidence['observed_date']}"
    answers = _answer("duplicate_expected", "planet-fitness", answer, signature=signature)
    applied = apply_answers(duplicate_result, answers)
    leak = _leak(applied, "duplicate_debit_order_leak")
    assert (leak.status, leak.claims.user_effect) == (status, effect)
    if status != "active":
        assert select_questions(applied.leaks, answers)[0] == []


def test_a_new_duplicate_incident_asks_again(duplicate_result) -> None:
    answers = _answer("duplicate_expected", "planet-fitness", "both_expected", signature="d=2026-05-25")
    questions, _ = select_questions(duplicate_result.leaks, answers)
    assert [item.kind for item in questions] == ["duplicate_expected"]
    assert _leak(apply_answers(duplicate_result, answers), "duplicate_debit_order_leak").status == "active"


# -------------------------------------------------------------------- data usage


@pytest.fixture(scope="module")
def data_result() -> LeakDetectionResult:
    from tests.intelligence_dataset import load_intelligence_scenario

    scenario = load_intelligence_scenario("FI-036-mobile-data-inefficiency")
    return _detect(list(scenario.transactions))


def test_a_data_bundle_finding_asks_about_usage(data_result) -> None:
    leak = _leak(data_result, "airtime_data_leak")
    assert leak.evidence["finding_focus"] == "data_inefficiency"
    questions, _ = select_questions(data_result.leaks, {})
    question = next(item for item in questions if item.kind == "data_usage")
    assert question.prompt == "Do you usually use all your data before the bundle expires?"
    assert "not measured usage" in question.why_asked


def test_data_answers_are_self_reported_and_say_so(data_result) -> None:
    leak = _leak(data_result, "airtime_data_leak")
    subject = next(item.question_key for item in select_questions(data_result.leaks, {})[0] if item.kind == "data_usage")
    signature = next(item.signature for item in select_questions(data_result.leaks, {})[0] if item.kind == "data_usage")
    key = subject.split(":", 1)[1]
    most = _leak(apply_answers(data_result, _answer("data_usage", key, "most_remains", signature=signature)), "airtime_data_leak")
    assert most.claims.user_effect == "strengthens"
    assert most.claims.possible[0].text == "Your data bundle may be bigger than you need."
    assert "not measured usage" in most.claims.possible[0].cannot_see[0]
    almost = _leak(apply_answers(data_result, _answer("data_usage", key, "almost_all", signature=signature)), "airtime_data_leak")
    assert almost.claims.user_effect == "weakens"
    assert leak.claims.confirmed == most.claims.confirmed


# --------------------------------------------------------------------- insurance


@pytest.fixture(scope="module")
def insurance_result() -> LeakDetectionResult:
    extra = _monthly(1, (2026, 1), 9, "DEBIT ORDER SANLAM FUNERAL", "412")
    extra += _monthly(2, (2026, 1), 9, "DEBIT ORDER OUTSURANCE", "389")
    return _detect(_statement((2026, 1), 9, extra))


def test_insurance_findings_ask_what_each_policy_covers(insurance_result) -> None:
    questions, _ = select_questions(insurance_result.leaks, {})
    assert {item.question_key for item in questions} == {
        "insurance_cover:sanlam", "insurance_cover:outsurance",
    }
    assert questions[0].prompt.startswith("What does your ")


def _cover_answers(first: str, second: str) -> dict[str, StoredAnswer]:
    return {
        **_answer("insurance_cover", "sanlam", first, signature="amt=412"),
        **_answer("insurance_cover", "outsurance", second, signature="amt=389", minutes=1),
    }


def test_two_policies_described_as_the_same_cover_are_flagged_as_possible_overlap(insurance_result) -> None:
    applied = apply_answers(insurance_result, _cover_answers("funeral", "funeral"))
    for leak in applied.leaks:
        if leak.evidence.get("merchant_category") != "Insurance":
            continue
        assert leak.claims.user_effect == "strengthens"
        assert "overlapping funeral cover" in leak.claims.possible[0].text
        assert "Whether the benefits differ" in leak.claims.possible[0].cannot_see[0]
        assert any("a month for policies you describe as funeral cover" in item.text for item in leak.claims.confirmed)


def test_different_cover_types_are_not_flagged(insurance_result) -> None:
    applied = apply_answers(insurance_result, _cover_answers("funeral", "car"))
    for leak in applied.leaks:
        if leak.evidence.get("merchant_category") == "Insurance":
            assert leak.claims.user_effect == "none"
            assert not any("overlapping" in item.text for item in leak.claims.possible)
            assert leak.claims.reported[0].text.startswith("You told us this policy covers")


def test_other_and_not_sure_never_create_an_overlap(insurance_result) -> None:
    for first, second in (("other", "other"), ("not_sure", "not_sure")):
        applied = apply_answers(insurance_result, _cover_answers(first, second))
        assert not any(
            "overlapping" in item.text for leak in applied.leaks if leak.claims for item in leak.claims.possible
        )


def test_two_car_policies_warn_they_may_cover_different_vehicles(insurance_result) -> None:
    applied = apply_answers(insurance_result, _cover_answers("car", "car"))
    leak = next(item for item in applied.leaks if item.evidence.get("merchant_key") == "SANLAM")
    assert any("different vehicles" in line for line in leak.claims.possible[0].cannot_see)


# ----------------------------------------------------------------------- pipeline


def test_attach_questions_applies_answers_then_lists_what_is_left(netflix_result) -> None:
    result = attach_questions(netflix_result, {})
    assert [item.question_key for item in result.questions] == ["subscription_usage:netflix"]
    answered = attach_questions(netflix_result, _answer("subscription_usage", "netflix", "rarely", signature="amt=99"))
    assert answered.questions == []
    assert _leak(answered, "subscription_leak").claims.reported


def test_unreadable_answers_mean_no_questions_rather_than_repeated_ones(monkeypatch, netflix_result) -> None:
    def boom(*_args, **_kwargs):
        raise HTTPException(status_code=503, detail="down")

    monkeypatch.setattr(leak_detection, "load_finding_answers", boom)
    result = leak_detection._with_user_answers(netflix_result, "user", "token")
    assert result.questions == []
    assert result is netflix_result


# ------------------------------------------------------------------- validation


@pytest.mark.parametrize(
    ("kind", "answer", "valid"),
    [
        ("subscription_usage", "still_use", True),
        ("subscription_usage", "not_sure", True),
        ("subscription_usage", "frequently", False),
        ("subscription_usage", "skipped", False),
        ("cancelled_in", "2026-04", True),
        ("cancelled_in", "2026-13", False),
        ("cancelled_in", "April", False),
        ("duplicate_expected", "both_expected", True),
        ("insurance_cover", "funeral", True),
        ("insurance_cover", "pet", False),
    ],
)
def test_answers_must_be_one_of_the_offered_options(kind: str, answer: str, valid: bool) -> None:
    assert is_valid_answer(kind, answer) is valid


@pytest.mark.parametrize(
    ("key", "parsed"),
    [
        ("subscription_usage:netflix", ("subscription_usage", "netflix")),
        ("cancelled_in:planet-fitness", ("cancelled_in", "planet-fitness")),
        ("bogus:netflix", None),
        ("subscription_usage:", None),
        ("subscription_usage:Net flix", None),
        ("subscription_usage:../etc", None),
    ],
)
def test_question_keys_are_checked(key: str, parsed) -> None:
    assert parse_question_key(key) == parsed


# --------------------------------------------------------------------- storage

USER_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(autouse=True)
def configured_project(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(finding_answers, "_project_url", lambda: "https://tracepay.test")
    monkeypatch.setattr(finding_registry, "_project_url", lambda: "https://tracepay.test")


def test_saving_an_answer_appends_a_user_scoped_row(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict[str, object]] = []

    def request(url: str, _token: str, *, method: str, body=None, **_kwargs):
        assert method == "POST" and "finding_answers" in url
        sent.append(body)
        return [{**body, "answered_at": body["answered_at"]}]

    monkeypatch.setattr(finding_answers, "_request_json", request)
    stored = finding_answers.save_finding_answer(
        USER_ID,
        "token",
        finding_answers.FindingAnswerRequest(question_key="subscription_usage:netflix", answer="rarely", signature="amt=99"),
        answered_at=NOW,
    )
    assert stored.answer == "rarely"
    assert sent[0]["user_id"] == USER_ID
    assert sent[0]["question_kind"] == "subscription_usage"
    assert sent[0]["status"] == "answered"
    assert finding_answers.answer_payload(stored) == {
        "saved": True, "question_key": "subscription_usage:netflix", "status": "answered", "answer": "rarely",
    }


def test_an_answer_outside_the_options_is_rejected_before_anything_is_stored(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(finding_answers, "_request_json", lambda *_a, **_k: pytest.fail("must not store"))
    for key, answer in (
        ("subscription_usage:netflix", "frequently"),
        ("subscription_usage:netflix", "skipped"),
        ("nonsense:netflix", "rarely"),
    ):
        with pytest.raises(HTTPException) as error:
            finding_answers.save_finding_answer(
                USER_ID, "token", finding_answers.FindingAnswerRequest(question_key=key, answer=answer), answered_at=NOW
            )
        assert error.value.status_code == 422


def test_skipping_is_stored_as_a_skip_not_an_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict[str, object]] = []

    def request(_url: str, _token: str, *, method: str, body=None, **_kwargs):
        sent.append(body)
        return [dict(body)]

    monkeypatch.setattr(finding_answers, "_request_json", request)
    stored = finding_answers.skip_finding_question(
        USER_ID, "token", finding_answers.FindingSkipRequest(question_key="data_usage:data"), answered_at=NOW
    )
    assert (sent[0]["status"], sent[0]["answer"]) == ("skipped", "skipped")
    assert finding_answers.answer_payload(stored)["answer"] is None


def test_loading_keeps_the_newest_row_per_question_and_drops_malformed_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {"question_key": "subscription_usage:netflix", "question_kind": "subscription_usage", "answer": "dont_use",
         "signature": "amt=99", "status": "answered", "answered_at": "2026-10-28T10:00:00+00:00"},
        {"question_key": "subscription_usage:netflix", "question_kind": "subscription_usage", "answer": "still_use",
         "signature": "amt=99", "status": "answered", "answered_at": "2026-10-20T10:00:00+00:00"},
        {"question_key": "x", "question_kind": "not_a_kind", "answer": "a", "status": "answered", "answered_at": None},
        {"question_key": None},
    ]
    monkeypatch.setattr(finding_answers, "_request_json", lambda *_a, **_k: rows)
    loaded = finding_answers.load_finding_answers(USER_ID, "token")
    assert set(loaded) == {"subscription_usage:netflix"}
    assert loaded["subscription_usage:netflix"].answer == "dont_use"
