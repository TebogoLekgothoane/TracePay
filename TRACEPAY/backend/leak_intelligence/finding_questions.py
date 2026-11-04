"""Ask the user only what could change a finding, and apply what they say.

A statement cannot show whether a service is used, whether a second collection
was expected, or what an insurance policy covers. Only the user knows. This
module decides which of those questions are worth asking, keeps the number
small, and applies the answers without ever editing the statement facts.

Rules the code enforces:

* a question exists only where one of its answers changes a finding;
* every question allows "Not sure" and can be skipped;
* a question that was answered or skipped is not asked again unless the finding
  itself has materially changed (new price, new incident);
* at most ``MAX_PENDING`` questions are returned at once, strongest finding
  first, with no more than ``MAX_PER_KIND`` of any one kind;
* answers are reported as what the user said, apart from what the statements
  prove, and never raise or lower the detector's confidence.
"""

from __future__ import annotations

import re
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Literal

from pydantic import BaseModel

from .leak_claims import _dec, _day, _money
from .leak_keys import subject_key
from .leak_models import (
    ConfirmedFact,
    FindingQuestion,
    LeakClaims,
    LeakDetection,
    LeakDetectionResult,
    PossibleLeak,
    QuestionKind,
    QuestionOption,
    ReportedFact,
    UserEffect,
)

MAX_PENDING = 3
MAX_PER_KIND = 2
FOLLOW_UP_PRIORITY = 1_000_000.0
# A change in the finding's price or size beyond this reopens an answered question.
REVISIT_RELATIVE_CHANGE = Decimal("0.10")

NOT_SURE = "not_sure"
_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

_OPTIONS: dict[str, tuple[tuple[str, str], ...]] = {
    "subscription_usage": (
        ("still_use", "Still use it"),
        ("rarely", "Rarely use it"),
        ("dont_use", "Don't use it"),
        ("cancelled", "Already cancelled"),
        ("not_recognised", "Don't recognise it"),
    ),
    "duplicate_expected": (
        ("both_expected", "Both expected"),
        ("one_unexpected", "One was unexpected"),
        ("one_refunded", "One was refunded"),
    ),
    "data_usage": (
        ("almost_all", "Almost all"),
        ("some_remains", "Some remains"),
        ("most_remains", "Most remains"),
    ),
    "insurance_cover": (
        ("life", "Life"),
        ("funeral", "Funeral"),
        ("car", "Car"),
        ("household", "Household"),
        ("medical", "Medical"),
        ("other", "Other"),
    ),
    # For a regular payment the statement cannot name (a bank debit order, say).
    "payment_purpose": (
        ("insurance", "Insurance or cover"),
        ("credit", "Loan, card or store account"),
        ("membership", "Subscription or membership"),
        ("medical", "Medical aid or health"),
        ("utilities", "Phone, internet or utilities"),
        ("savings", "Savings or investment"),
        ("person", "Rent or money to a person"),
        ("other", "Something else"),
    ),
    "bank_account": (
        ("fnb", "FNB"),
        ("absa", "Absa"),
        ("standard_bank", "Standard Bank"),
        ("nedbank", "Nedbank"),
        ("capitec", "Capitec"),
        ("tymebank", "TymeBank"),
        ("discovery_bank", "Discovery Bank"),
        ("other", "Other"),
    ),
}
_COVER_LABELS = dict(_OPTIONS["insurance_cover"])

# Question kinds that need outside data before an answer can change anything.
# Bank account is asked only once a verified fee schedule is available.
_NEEDS_REFERENCE_DATA = {"bank_account": "bank_fee_schedule"}

_USAGE_POSSIBLE = "You may be paying for a service you no longer use."


class StoredAnswer(BaseModel):
    """The latest thing the user did with one question."""

    question_key: str
    kind: QuestionKind
    answer: str
    signature: str = ""
    status: Literal["answered", "skipped"] = "answered"
    answered_at: datetime | None = None


# ----------------------------------------------------------------- validation


def question_key(kind: str, subject: str) -> str:
    return f"{kind}:{subject}"


def parse_question_key(value: str) -> tuple[str, str] | None:
    kind, _, subject = value.partition(":")
    if kind not in _OPTIONS and kind != "cancelled_in":
        return None
    if not subject or len(subject) > 100 or not re.fullmatch(r"[a-z0-9-]+", subject):
        return None
    return kind, subject


def is_valid_answer(kind: str, answer: str) -> bool:
    if answer == NOT_SURE:
        return kind in _OPTIONS or kind == "cancelled_in"
    if kind == "cancelled_in":
        return bool(_MONTH.match(answer))
    return answer in {value for value, _label in _OPTIONS.get(kind, ())}


def latest_answers(rows: Iterable[StoredAnswer]) -> dict[str, StoredAnswer]:
    """Keep the newest row per question; rows without a time lose to rows with one."""
    newest: dict[str, StoredAnswer] = {}
    for row in rows:
        current = newest.get(row.question_key)
        if current is None or _stamp(row) >= _stamp(current):
            newest[row.question_key] = row
    return newest


def _stamp(row: StoredAnswer) -> float:
    return row.answered_at.timestamp() if row.answered_at else 0.0


# ------------------------------------------------------------------ signatures


def _subject(leak: LeakDetection) -> str | None:
    merchant = leak.evidence.get("merchant_key")
    if isinstance(merchant, str) and merchant.strip():
        return subject_key(merchant)
    return None


def _current_amount(leak: LeakDetection) -> Decimal | None:
    evidence = leak.evidence
    for key in ("latest_amount", "typical_amount", "average_amount", "candidate_amount"):
        value = _dec(evidence.get(key))
        if value is not None and value > 0:
            return value
    payments = evidence.get("payment_amounts")
    if isinstance(payments, list) and payments:
        value = _dec(payments[-1])
        if value is not None and value > 0:
            return value
    return None


def _signature(kind: str, leak: LeakDetection) -> str:
    if kind == "duplicate_expected":
        return f"d={leak.evidence.get('observed_date') or ''}"
    if kind == "data_usage":
        total, count = _dec(leak.evidence.get("data_total")), leak.evidence.get("data_transaction_count")
        if total is not None and isinstance(count, int) and count > 0:
            return f"amt={(total / count).quantize(Decimal('1'))}"
        return ""
    if kind in {"subscription_usage", "insurance_cover", "payment_purpose"}:
        amount = _current_amount(leak)
        return f"amt={amount.quantize(Decimal('1'))}" if amount is not None else ""
    return ""


def _signature_changed(old: str, new: str) -> bool:
    """True when the finding is no longer the one the user answered about."""
    if not old or not new or old == new:
        return False
    old_key, _, old_value = old.partition("=")
    new_key, _, new_value = new.partition("=")
    if old_key != new_key:
        return True
    if old_key == "amt":
        before, after = _dec(old_value), _dec(new_value)
        if before is None or after is None or before == 0:
            return True
        return abs(after - before) / before > REVISIT_RELATIVE_CHANGE
    return old_value != new_value


def _answer_applies(answer: StoredAnswer | None, leak: LeakDetection, kind: str) -> bool:
    """An answer about an older version of the finding no longer applies."""
    return (
        answer is not None
        and answer.status == "answered"
        and answer.answer != NOT_SURE
        and not _signature_changed(answer.signature, _signature(kind, leak))
    )


# ------------------------------------------------------------------- selecting


def select_questions(
    leaks: list[LeakDetection],
    answers: dict[str, StoredAnswer],
    *,
    reference_data: frozenset[str] = frozenset(),
    limit: int = MAX_PENDING,
    per_kind_limit: int = MAX_PER_KIND,
) -> tuple[list[FindingQuestion], int]:
    """Pick the few questions most worth asking now. Returns (questions, not shown)."""
    candidates: dict[str, FindingQuestion] = {}
    for leak in leaks:
        if leak.status in {"resolved", "dismissed"}:
            continue
        for question in _candidates(leak, answers):
            needs = _NEEDS_REFERENCE_DATA.get(question.kind)
            if needs is not None and needs not in reference_data:
                continue
            stored = answers.get(question.question_key)
            if stored is not None and not _signature_changed(stored.signature, question.signature):
                continue
            current = candidates.get(question.question_key)
            if current is None or question.priority > current.priority:
                candidates[question.question_key] = question

    ranked = sorted(candidates.values(), key=lambda item: (-item.priority, item.question_key))
    chosen: list[FindingQuestion] = []
    per_kind: dict[str, int] = defaultdict(int)
    for question in ranked:
        if len(chosen) >= limit:
            break
        if per_kind[question.kind] >= per_kind_limit:
            continue
        per_kind[question.kind] += 1
        chosen.append(question)
    return chosen, len(ranked) - len(chosen)


def _priority(leak: LeakDetection) -> float:
    """Strongest evidence first: cost times confidence, nudged by what is at stake."""
    score = float(leak.estimated_monthly_impact or 0) * leak.confidence
    evidence = leak.evidence
    if evidence.get("price_change_focus"):
        score *= 1.3
    if evidence.get("failed_payment_attempt_count"):
        score *= 1.1
    if leak.leak_type in {"duplicate_debit_order_leak", "duplicate_payment_leak"}:
        score *= 1.2  # a refund is easier to get the sooner it is asked for
    return round(score, 2)


def _context(leak: LeakDetection) -> list[str]:
    claims = leak.claims
    return [fact.text for fact in claims.confirmed[:2]] if claims else []


def _display_name(leak: LeakDetection) -> str:
    for key in ("merchant_display_name", "merchant_key"):
        value = leak.evidence.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "this merchant"


def _options(kind: str) -> list[QuestionOption]:
    return [
        *(QuestionOption(value=value, label=label) for value, label in _OPTIONS[kind]),
        QuestionOption(value=NOT_SURE, label="Not sure"),
    ]


def _candidates(leak: LeakDetection, answers: dict[str, StoredAnswer]) -> list[FindingQuestion]:
    subject = _subject(leak)
    evidence = leak.evidence
    focus = evidence.get("finding_focus")
    name = _display_name(leak)
    found: list[FindingQuestion] = []

    def make(kind: str, subject_value: str, prompt: str, why: str, *, boost: float = 1.0) -> FindingQuestion:
        return FindingQuestion(
            question_key=question_key(kind, subject_value),
            kind=kind,  # type: ignore[arg-type]
            leak_id=leak.leak_id,
            leak_type=leak.leak_type,
            subject=name,
            prompt=prompt,
            why_asked=why,
            context=_context(leak),
            options=_options(kind),
            priority=_priority(leak) * boost,
            signature=_signature(kind, leak),
        )

    amount = _current_amount(leak)
    if leak.leak_type == "subscription_leak" and focus == "subscription_review" and subject:
        usage_key = question_key("subscription_usage", subject)
        paid = f"You paid {_money(amount)} to {name}." if amount is not None else f"You pay {name} regularly."
        found.append(
            make(
                "subscription_usage",
                subject,
                f"{paid} Do you still use it?",
                "Your answer shows whether this is worth reviewing. Rarely using something does not prove it is wasted.",
            )
        )
        usage = answers.get(usage_key)
        if (
            usage is not None
            and usage.status == "answered"
            and usage.answer == "cancelled"
            and _answer_applies(usage, leak, "subscription_usage")
        ):
            months = _payment_months(leak)
            if months:
                found.append(_cancel_month_question(leak, subject, name, months))

    if leak.leak_type in {"duplicate_debit_order_leak", "duplicate_payment_leak"} and subject:
        amount_text = _money(evidence.get("candidate_amount"))
        count = evidence.get("transaction_count_in_group")
        times = "twice" if count == 2 else f"{count} times" if isinstance(count, int) else "more than once"
        found.append(
            make(
                "duplicate_expected",
                subject,
                f"You were charged {amount_text} {times} by {name}. Were all of those payments expected?",
                "This helps tell a real duplicate from a legitimate collection, so only genuine ones are flagged.",
            )
        )

    if leak.leak_type == "airtime_data_leak" and focus == "data_inefficiency":
        data_subject = subject or "data"
        found.append(
            make(
                "data_usage",
                data_subject,
                "Do you usually use all your data before the bundle expires?",
                "This is your own estimate, not measured usage, but it shows whether the bundle suits you.",
            )
        )

    if (
        leak.leak_type in {"recurring_payment_leak", "unknown_recurring_payment"}
        and evidence.get("merchant_category") == "Insurance"
        and subject
    ):
        found.append(
            make(
                "insurance_cover",
                subject,
                f"What does your {name} policy cover?",
                "Knowing what each policy covers lets us check whether any overlap. It does not mean the cover is unnecessary.",
            )
        )

    if leak.leak_type == "unknown_recurring_payment" and evidence.get("merchant_category") != "Insurance":
        # The merchant is often unnamed, so key the question on the amount's own subject.
        purpose_subject = subject or _amount_subject(leak)
        if purpose_subject:
            paid = f"You pay {_money(amount)} regularly" if amount is not None else "You pay this regularly"
            found.append(
                make(
                    "payment_purpose",
                    purpose_subject,
                    f"{paid} and the statement does not say who it goes to. What is it for?",
                    "Only you know. Savings, rent and loan repayments are not leaks, so your answer decides whether this is shown.",
                    boost=1.1,
                )
            )

    if leak.leak_type == "bank_fee_leak":
        found.append(
            make(
                "bank_account",
                "profile",
                "Which bank account do you use?",
                "Your bank and account type let us compare your fees against that bank's published pricing.",
            )
        )
    return found


def _amount_subject(leak: LeakDetection) -> str | None:
    """A stable subject for a payment with no merchant: its regular amount."""
    amount = _current_amount(leak)
    return f"amount-{int(amount)}" if amount is not None else None


def _payment_months(leak: LeakDetection) -> list[str]:
    months = {
        row.date.strftime("%Y-%m") for row in leak.supporting_transactions if row.role == "payment"
    }
    return sorted(months)


def _cancel_month_question(leak: LeakDetection, subject: str, name: str, months: list[str]) -> FindingQuestion:
    first_year, first_month = (int(part) for part in months[0].split("-"))
    before = (first_year - 1, 12) if first_month == 1 else (first_year, first_month - 1)
    values = [f"{before[0]:04d}-{before[1]:02d}", *months[:-1]]
    options = [
        QuestionOption(
            value=value,
            label=(
                f"Before {_month_label(months[0])}"
                if index == 0
                else _month_label(value)
            ),
        )
        for index, value in enumerate(values)
    ]
    options.append(QuestionOption(value=NOT_SURE, label="Not sure"))
    return FindingQuestion(
        question_key=question_key("cancelled_in", subject),
        kind="cancelled_in",
        leak_id=leak.leak_id,
        leak_type=leak.leak_type,
        subject=name,
        prompt=f"When did you cancel {name}?",
        why_asked="We can then count the payments your statements show after that month.",
        context=_context(leak),
        options=options,
        # A follow-up to something the user just said goes before new questions.
        priority=FOLLOW_UP_PRIORITY + _priority(leak),
        signature="",
    )


def _month_label(value: str) -> str:
    year, month = (int(part) for part in value.split("-"))
    return f"{date(year, month, 1):%b %Y}"


# -------------------------------------------------------------------- applying


def apply_answers(
    result: LeakDetectionResult, answers: dict[str, StoredAnswer]
) -> LeakDetectionResult:
    """Fold the user's answers into the findings they were about."""
    if not answers:
        return result
    covers = _insurance_covers(result.leaks, answers)
    leaks = [_apply_to_leak(leak, answers, covers) for leak in result.leaks]
    return result.model_copy(update={"leaks": leaks})


def attach_questions(
    result: LeakDetectionResult,
    answers: dict[str, StoredAnswer],
    *,
    reference_data: frozenset[str] = frozenset(),
) -> LeakDetectionResult:
    """Apply answers, then list the few questions still worth asking."""
    applied = apply_answers(result, answers)
    questions, not_shown = select_questions(applied.leaks, answers, reference_data=reference_data)
    return applied.model_copy(update={"questions": questions, "questions_not_shown": not_shown})


class _Edit:
    """Collects what answers do to one finding, so each rule stays small."""

    def __init__(self, leak: LeakDetection) -> None:
        base = leak.claims or LeakClaims()
        self.leak = leak
        self.confirmed = list(base.confirmed)
        self.reported = list(base.reported)
        self.possible = list(base.possible)
        self.effect: UserEffect = base.user_effect
        self.status = leak.status

    def tell(self, kind: str, answer: str, text: str) -> None:
        self.reported.append(ReportedFact(text=text, question_kind=kind, answer=answer))

    def drop_possible(self, prefix: str) -> None:
        self.possible = [item for item in self.possible if not item.text.startswith(prefix)]

    def finish(self) -> LeakDetection:
        claims = LeakClaims(
            confirmed=self.confirmed,
            reported=self.reported,
            possible=self.possible,
            user_effect=self.effect,
        )
        update: dict[str, Any] = {"claims": claims}
        if self.status != self.leak.status:
            update["status"] = self.status
        return self.leak.model_copy(update=update)


def _apply_to_leak(
    leak: LeakDetection,
    answers: dict[str, StoredAnswer],
    covers: dict[str, tuple[str, LeakDetection]],
) -> LeakDetection:
    subject = _subject(leak)
    if leak.leak_type == "unknown_recurring_payment":
        purpose_subject = subject or _amount_subject(leak)
        purpose = answers.get(question_key("payment_purpose", purpose_subject)) if purpose_subject else None
        if _answer_applies(purpose, leak, "payment_purpose"):
            assert purpose is not None
            purpose_edit = _Edit(leak)
            if _apply_purpose(purpose_edit, purpose.answer):
                return purpose_edit.finish()
    if subject is None:
        return leak
    edit = _Edit(leak)
    changed = False

    usage = answers.get(question_key("subscription_usage", subject))
    if leak.leak_type == "subscription_leak" and _answer_applies(usage, leak, "subscription_usage"):
        assert usage is not None
        changed |= _apply_usage(edit, usage.answer, answers.get(question_key("cancelled_in", subject)))

    duplicate = answers.get(question_key("duplicate_expected", subject))
    if leak.leak_type in {"duplicate_debit_order_leak", "duplicate_payment_leak"} and _answer_applies(
        duplicate, leak, "duplicate_expected"
    ):
        assert duplicate is not None
        changed |= _apply_duplicate(edit, duplicate.answer)

    data = answers.get(question_key("data_usage", subject or "data"))
    if (
        leak.leak_type == "airtime_data_leak"
        and leak.evidence.get("finding_focus") == "data_inefficiency"
        and _answer_applies(data, leak, "data_usage")
    ):
        assert data is not None
        changed |= _apply_data(edit, data.answer)

    cover = covers.get(leak.leak_id)
    if cover is not None:
        changed |= _apply_insurance(edit, cover, covers)

    return edit.finish() if changed else leak


def _apply_usage(edit: _Edit, answer: str, cancelled_in: StoredAnswer | None) -> bool:
    if answer == "still_use":
        edit.tell("subscription_usage", answer, "You told us you still use this.")
        edit.drop_possible(_USAGE_POSSIBLE)
        edit.effect = "weakens"
    elif answer == "rarely":
        edit.tell("subscription_usage", answer, "You told us you rarely use this.")
        edit.drop_possible(_USAGE_POSSIBLE)
        edit.possible.insert(
            0,
            PossibleLeak(
                text="You may not be getting enough from this service to justify what it costs.",
                cannot_see=["How much value you get from it, which only you can judge."],
                check="Decide whether the cost is worth the little use it gets.",
            ),
        )
        edit.effect = "strengthens"
    elif answer == "dont_use":
        edit.tell("subscription_usage", answer, "You told us you don't use this.")
        edit.drop_possible(_USAGE_POSSIBLE)
        edit.possible.insert(
            0,
            PossibleLeak(
                text="You may be able to stop paying for something you don't use.",
                cannot_see=["Whether cancelling is subject to a notice period, contract or fee."],
                check="Check the provider's cancellation terms.",
            ),
        )
        edit.effect = "strengthens"
    elif answer == "not_recognised":
        edit.tell("subscription_usage", answer, "You told us you don't recognise this payment.")
        edit.drop_possible(_USAGE_POSSIBLE)
        edit.possible.insert(
            0,
            PossibleLeak(
                text="This charge may not be yours.",
                cannot_see=[
                    "Who is behind the name on the statement.",
                    "Whether someone else with access to the account signed up.",
                ],
                check="Ask your bank who collects it and, if you did not authorise it, how to stop and dispute it.",
            ),
        )
        edit.effect = "strengthens"
    elif answer == "cancelled":
        edit.tell("subscription_usage", answer, "You told us you already cancelled this.")
        edit.drop_possible(_USAGE_POSSIBLE)
        if cancelled_in is None or not _month_known(cancelled_in):
            edit.possible.insert(
                0,
                PossibleLeak(
                    text="If you cancelled before the most recent payment, you may still be billed.",
                    cannot_see=["The date the cancellation took effect."],
                    check="Tell us the month you cancelled and we will count payments after it.",
                ),
            )
        else:
            _apply_cancel_month(edit, cancelled_in.answer)
    else:
        return False
    return True


def _month_known(answer: StoredAnswer) -> bool:
    return answer.status == "answered" and bool(_MONTH.match(answer.answer))


def _apply_cancel_month(edit: _Edit, month: str) -> None:
    leak = edit.leak
    year, mon = (int(part) for part in month.split("-"))
    cutoff = date(year, mon, monthrange(year, mon)[1])
    label = _month_label(month)
    edit.tell("cancelled_in", month, f"You told us you cancelled in {label}.")
    payments = [row for row in leak.supporting_transactions if row.role == "payment"]
    complete = len(leak.supporting_transactions) == leak.supporting_transaction_count
    after = [row for row in payments if row.date > cutoff]
    if after:
        total = sum((row.amount for row in after), Decimal("0"))
        text = f"Your statements show {len(after)} payment{'s' if len(after) != 1 else ''} after {label}"
        figures: dict[str, Any] = {"count": len(after), "last_date": max(row.date for row in after).isoformat()}
        if complete:
            text += f", {_money(total)} in all"
            figures["total"] = str(total)
        edit.confirmed.append(ConfirmedFact(text=f"{text}, the latest on {_day(max(row.date for row in after))}.", figures=figures))
        edit.possible.insert(
            0,
            PossibleLeak(
                text="You may still be paying for a service you cancelled.",
                cannot_see=[
                    "Whether the cancellation went through.",
                    "Whether another plan or card is being billed.",
                ],
                check="Ask the provider to confirm your cancellation date, and ask for a refund of payments taken after it.",
            ),
        )
        edit.effect = "strengthens"
    elif payments and complete:
        edit.confirmed.append(
            ConfirmedFact(text=f"Your statements show no payments after {label}.", figures={"count": 0})
        )
        edit.effect = "resolves"
        edit.status = "resolved"


def _apply_duplicate(edit: _Edit, answer: str) -> bool:
    if answer == "both_expected":
        edit.tell("duplicate_expected", answer, "You told us both payments were expected.")
        edit.possible = []
        edit.effect = "resolves"
        edit.status = "dismissed"
    elif answer == "one_unexpected":
        edit.tell("duplicate_expected", answer, "You told us one of the payments was unexpected.")
        edit.effect = "strengthens"
    elif answer == "one_refunded":
        edit.tell("duplicate_expected", answer, "You told us one of the payments was refunded.")
        edit.possible = []
        edit.effect = "resolves"
        edit.status = "resolved"
    else:
        return False
    return True


def _apply_purpose(edit: _Edit, answer: str) -> bool:
    label = dict(_OPTIONS["payment_purpose"]).get(answer)
    if label is None:
        return False
    if answer in {"savings", "person"}:
        what = "savings or an investment" if answer == "savings" else "rent or money sent to a person"
        edit.tell("payment_purpose", answer, f"You told us this is {what}.")
        edit.possible = []
        edit.effect = "resolves"
        edit.status = "dismissed"
    elif answer == "credit":
        edit.tell("payment_purpose", answer, "You told us this is a loan, card or store account repayment.")
        edit.possible.insert(
            0,
            PossibleLeak(
                text="Part of each repayment may be interest.",
                cannot_see=["The interest rate and balance on the account."],
                check="Look at the account's statement to see how much of the repayment is interest.",
            ),
        )
        edit.effect = "none"
    elif answer in {"insurance", "medical", "utilities"}:
        names = {"insurance": "insurance", "medical": "medical aid or health cover", "utilities": "phone, internet or utilities"}
        edit.tell("payment_purpose", answer, f"You told us this is {names[answer]}.")
        edit.effect = "weakens"
    elif answer == "membership":
        edit.tell("payment_purpose", answer, "You told us this is a subscription or membership.")
        edit.effect = "none"
    else:
        edit.tell("payment_purpose", answer, "You told us this is something else.")
    return True


def _apply_data(edit: _Edit, answer: str) -> bool:
    if answer == "almost_all":
        edit.tell("data_usage", answer, "You told us you usually use almost all of your data.")
        edit.effect = "weakens"
    elif answer == "some_remains":
        edit.tell("data_usage", answer, "You told us some of your data usually remains.")
    elif answer == "most_remains":
        edit.tell("data_usage", answer, "You told us most of your data usually remains.")
        edit.possible.insert(
            0,
            PossibleLeak(
                text="Your data bundle may be bigger than you need.",
                cannot_see=["How much data you actually use. This is your own estimate, not measured usage."],
                check="Compare your usage in your network's app with the size of the bundle.",
            ),
        )
        edit.effect = "strengthens"
    else:
        return False
    return True


# ------------------------------------------------------------------- insurance


def _insurance_covers(
    leaks: list[LeakDetection], answers: dict[str, StoredAnswer]
) -> dict[str, tuple[str, LeakDetection]]:
    """leak_id -> (cover type, leak) for every active insurance finding the user described."""
    covers: dict[str, tuple[str, LeakDetection]] = {}
    for leak in leaks:
        subject = _subject(leak)
        if (
            subject is None
            or leak.status in {"resolved", "dismissed"}
            or leak.evidence.get("merchant_category") != "Insurance"
        ):
            continue
        stored = answers.get(question_key("insurance_cover", subject))
        if _answer_applies(stored, leak, "insurance_cover") and stored is not None and stored.answer in _COVER_LABELS:
            covers[leak.leak_id] = (stored.answer, leak)
    return covers


def _apply_insurance(
    edit: _Edit,
    mine: tuple[str, LeakDetection],
    covers: dict[str, tuple[str, LeakDetection]],
) -> bool:
    cover, leak = mine
    label = _COVER_LABELS[cover].lower()
    edit.tell("insurance_cover", cover, f"You told us this policy covers {label}.")
    if cover == "other":
        return True
    twins = [
        other
        for other_cover, other in covers.values()
        if other_cover == cover and other.leak_id != leak.leak_id
    ]
    if not twins:
        return True
    names = ", ".join(_display_name(other) for other in twins)
    costs = [leak, *twins]
    parts = [f"{_display_name(item)} {_money(_current_amount(item))}" for item in costs if _current_amount(item) is not None]
    if len(parts) == len(costs):
        edit.confirmed.append(
            ConfirmedFact(
                text=f"You pay {' and '.join(parts)} a month for policies you describe as {label} cover.",
                figures={"policies": len(costs)},
            )
        )
    cannot = ["Whether the benefits differ, such as the amount covered or who is covered."]
    if cover in {"car", "household"}:
        cannot.append("Whether they cover different vehicles or properties.")
    edit.possible.insert(
        0,
        PossibleLeak(
            text=f"You may be paying for overlapping {label} cover with {names}.",
            cannot_see=cannot,
            check="Compare what each policy pays out and who it covers before deciding anything.",
        ),
    )
    edit.effect = "strengthens"
    return True
