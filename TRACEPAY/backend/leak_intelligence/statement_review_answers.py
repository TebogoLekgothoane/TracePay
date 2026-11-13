"""Apply what the user told us to the statement report, and list the questions still open.

The same rules as the leak engine's own questions: an answer is what the user said, kept
apart from what the rows show; it never edits a statement fact; "Not sure" and a skip change
nothing; an answer about an older version of a finding no longer applies; and only a few
questions are put to the user at once.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from calendar import monthrange

from .finding_questions import (
    _COVER_LABELS,
    MAX_PENDING,
    MAX_PER_KIND,
    NOT_SURE,
    StoredAnswer,
    _signature_changed,
)
from .leak_models import FindingQuestion
from .statement_review import _MONTH_ABBR, ReviewFinding, money

# The question that could change a finding the most comes first: was it paid twice, is it
# still billing, who is it, what is covered, where does the money sit, do you use it.
QUESTION_ORDER = (
    "duplicate_expected",
    "cancelled_in",
    "payment_purpose",
    "insurance_cover",
    "transfer_purpose",
    "subscription_usage",
    "one_off_expected",
    "spending_level",
    "data_usage",
)

_PURPOSE_WHAT = {
    "insurance": "insurance",
    "credit": "a loan, card or store account repayment",
    "membership": "a subscription or membership",
    "medical": "medical aid or health cover",
    "utilities": "phone, internet or utilities",
    "other": "something else",
}
_USAGE_CLAUSE = {
    "still_use": "you still use {name}.",
    "rarely": "you rarely use {name}.",
    "dont_use": "you don't use {name}.",
    "cancelled": "you already cancelled {name}.",
    "not_recognised": "you don't recognise the {name} charge.",
}


def _applies(stored: StoredAnswer | None, question: FindingQuestion) -> bool:
    """An answer counts only if it was given, is not "Not sure", and is about this finding."""
    return (
        stored is not None
        and stored.status == "answered"
        and stored.answer != NOT_SURE
        and not _signature_changed(stored.signature, question.signature)
    )


def _answers_for(
    finding: ReviewFinding, kind: str, answers: dict[str, StoredAnswer]
) -> list[tuple[FindingQuestion, StoredAnswer]]:
    found = []
    for question in finding.questions:
        stored = answers.get(question.question_key)
        if question.kind == kind and stored is not None and _applies(stored, question):
            found.append((question, stored))
    return found


def _month_label(month: str) -> str:
    year, mon = (int(part) for part in month.split("-"))
    return f"{_MONTH_ABBR[mon]} {year}"


def apply_answers(
    findings: list[ReviewFinding], answers: dict[str, StoredAnswer]
) -> tuple[list[ReviewFinding], list[str]]:
    """Fold the answers into their findings. Returns the findings and notes for "not raised"."""
    notes: list[str] = []
    if not answers:
        return findings, notes
    for finding in findings:
        prefix = finding.key.split(":", 1)[0]
        name = finding.key.split(":", 1)[1] if ":" in finding.key else ""
        if prefix == "paired":
            _duplicate(finding, name, answers, notes)
        elif prefix == "opaque_billing":
            _cancelled(finding, name, answers)
        elif prefix == "unknown_recurring":
            _purpose(finding, answers, notes)
        elif prefix == "insurers":
            _insurers(finding, answers, notes)
        elif prefix == "round_trip_transfers":
            _transfers(finding, answers)
        elif prefix == "cloud_overlap":
            _usage(finding, answers)
        elif prefix == "optional_charge":
            _optional_charge(finding, answers, notes)
        elif prefix == "food_delivery":
            _spending_level(finding, answers, notes)
        elif prefix == "large_one_off":
            _one_off(finding, answers, notes)
    return findings, notes


def _duplicate(
    finding: ReviewFinding, name: str, answers: dict[str, StoredAnswer], notes: list[str]
) -> None:
    for _question, stored in _answers_for(finding, "duplicate_expected", answers):
        amounts = " / ".join(money(a) for a in finding.figures.get("amounts", []))  # type: ignore[union-attr]
        if stored.answer == "both_expected":
            finding.status = "dismissed"
            notes.append(
                f"You told us both {name} charges were expected, so the {amounts} pairs are not raised."
            )
        elif stored.answer == "one_unexpected":
            finding.reported.append("one of the payments was unexpected.")
        elif stored.answer == "one_refunded":
            finding.status = "resolved"
            notes.append(
                f"You told us one of the {name} charges in each pair was refunded, so they are not raised."
            )


def _cancelled(finding: ReviewFinding, name: str, answers: dict[str, StoredAnswer]) -> None:
    for _question, stored in _answers_for(finding, "cancelled_in", answers):
        month = stored.answer
        try:
            year, mon = (int(part) for part in month.split("-"))
            cutoff = date(year, mon, monthrange(year, mon)[1])
        except ValueError:
            continue
        label = _month_label(month)
        charges = [
            (date.fromisoformat(day), Decimal(amount))
            for day, amount in finding.figures.get("stopped_charges", [])  # type: ignore[union-attr]
        ]
        after = [(day, amount) for day, amount in charges if day > cutoff]
        if after:
            total = sum((amount for _, amount in after), Decimal("0"))
            latest = max(day for day, _ in after)
            finding.reported.append(
                f"you cancelled them in {label}. Your statements show {len(after)} "
                f"charge{'s' if len(after) != 1 else ''} of those amounts after {label}, "
                f"{money(total)} in all, the latest on {latest.day} {_MONTH_ABBR[latest.month]}."
            )
        else:
            finding.reported.append(
                f"you cancelled them in {label}. Your statements show no charges of those amounts "
                f"after {label}."
            )


def _purpose(
    finding: ReviewFinding, answers: dict[str, StoredAnswer], notes: list[str]
) -> None:
    label = str(finding.figures.get("label", "this payment")).split("*")[-1].strip()
    for _question, stored in _answers_for(finding, "payment_purpose", answers):
        if stored.answer in {"savings", "person"}:
            what = "savings or an investment" if stored.answer == "savings" else "rent or money sent to a person"
            finding.status = "dismissed"
            notes.append(f"You told us {label} is {what}, so it is not raised.")
        elif stored.answer in _PURPOSE_WHAT:
            finding.reported.append(f"this is {_PURPOSE_WHAT[stored.answer]}.")


def _insurers(
    finding: ReviewFinding, answers: dict[str, StoredAnswer], notes: list[str]
) -> None:
    told: dict[str, str] = {}
    for question, stored in _answers_for(finding, "insurance_cover", answers):
        if stored.answer in _COVER_LABELS:
            told[question.subject] = stored.answer
    if not told:
        return
    finding.reported.extend(
        f"{name} covers {_COVER_LABELS[cover].lower()}." for name, cover in told.items()
    )
    by_cover: dict[str, list[str]] = defaultdict(list)
    for name, cover in told.items():
        if cover != "other":
            by_cover[cover].append(name)
    for cover, names in by_cover.items():
        if len(names) >= 2:
            finding.reported.append(
                f"{' and '.join(names)} both cover {_COVER_LABELS[cover].lower()}."
            )
    insurers = list(finding.figures.get("insurers", []))  # type: ignore[arg-type]
    covers = [told.get(name) for name in insurers]
    if (
        covers
        and None not in covers
        and "other" not in covers
        and len(set(covers)) == len(covers)
    ):
        finding.status = "dismissed"
        listed = ", ".join(_COVER_LABELS[c].lower() for c in covers[:-1])  # type: ignore[index]
        listed = f"{listed} and {_COVER_LABELS[covers[-1]].lower()}"  # type: ignore[index]
        names = ", ".join(insurers[:-1]) + f" and {insurers[-1]}"
        notes.append(
            f"You told us {names} cover different things ({listed}), so overlapping cover is not raised."
        )


def _transfers(finding: ReviewFinding, answers: dict[str, StoredAnswer]) -> None:
    for _question, stored in _answers_for(finding, "transfer_purpose", answers):
        if stored.answer == "kept":
            finding.reported.append(
                "this is money you keep there. The rows show it coming back within days."
            )
        elif stored.answer == "moved_back":
            finding.reported.append("this is a budgeting move you reverse on purpose.")
        else:
            finding.reported.append("this is something else.")


def _usage(finding: ReviewFinding, answers: dict[str, StoredAnswer]) -> None:
    for question, stored in _answers_for(finding, "subscription_usage", answers):
        clause = _USAGE_CLAUSE.get(stored.answer)
        if clause:
            finding.reported.append(clause.format(name=question.subject))


def _optional_charge(
    finding: ReviewFinding, answers: dict[str, StoredAnswer], notes: list[str]
) -> None:
    """A charge the customer chose and still uses is not a leak."""
    for question, stored in _answers_for(finding, "subscription_usage", answers):
        if stored.answer == "still_use":
            finding.status = "dismissed"
            notes.append(f"You told us you still use {question.subject}, so it is not raised.")
        elif stored.answer == "cancelled":
            finding.reported.append(
                f"you already cancelled {question.subject}. Your statements show it charged "
                f"in {_join_months(finding)}."
            )
        elif (clause := _USAGE_CLAUSE.get(stored.answer)) is not None:
            finding.reported.append(clause.format(name=question.subject))


def _spending_level(
    finding: ReviewFinding, answers: dict[str, StoredAnswer], notes: list[str]
) -> None:
    """Someone who says this is their normal level is not leaking; the rows are unchanged."""
    for question, stored in _answers_for(finding, "spending_level", answers):
        if stored.answer == "usual":
            finding.status = "dismissed"
            notes.append(
                f"You told us {question.subject} is about what you usually spend, so it is not raised."
            )
        elif stored.answer == "more_than_usual":
            finding.reported.append(f"{question.subject} is more than you usually spend.")
        elif stored.answer == "one_off_reason":
            finding.reported.append(
                f"the {question.subject} spending was a one-off stretch, such as a trip, an event or guests."
            )
        elif stored.answer == "want_less":
            finding.reported.append(f"you want to spend less on {question.subject}.")


def _one_off(
    finding: ReviewFinding, answers: dict[str, StoredAnswer], notes: list[str]
) -> None:
    for question, stored in _answers_for(finding, "one_off_expected", answers):
        amount = money(finding.figures.get("amount", 0))  # type: ignore[arg-type]
        if stored.answer == "planned":
            finding.status = "dismissed"
            notes.append(
                f"You told us the {amount} {question.subject} charge was planned, so it is not raised."
            )
        elif stored.answer == "refunded":
            finding.status = "resolved"
            notes.append(
                f"You told us the {amount} {question.subject} charge was refunded, so it is not raised."
            )
        elif stored.answer == "unplanned":
            finding.reported.append(f"the {amount} {question.subject} charge was unplanned.")
        elif stored.answer == "not_mine":
            finding.reported.append(f"you don't recognise the {amount} {question.subject} charge.")


def _join_months(finding: ReviewFinding) -> str:
    months = [str(month) for month in finding.figures.get("months", [])]  # type: ignore[union-attr]
    labels = [_month_label(month) for month in months]
    return ", ".join(labels) if labels else "the months above"


# ------------------------------------------------------------------- what is still open


def open_questions(
    findings: list[ReviewFinding], answers: dict[str, StoredAnswer]
) -> list[FindingQuestion]:
    """Every question not yet answered or skipped, strongest first.

    A question that was answered or skipped stays closed unless the finding it was about has
    materially changed. Findings the user's answers set aside ask nothing more.
    """
    seen: set[str] = set()
    ranked: list[tuple[int, int, int, FindingQuestion]] = []
    for finding_index, finding in enumerate(findings):
        if finding.status != "active":
            continue
        for question_index, question in enumerate(finding.questions):
            if question.question_key in seen:
                continue
            stored = answers.get(question.question_key)
            if stored is not None and not _signature_changed(stored.signature, question.signature):
                continue
            seen.add(question.question_key)
            rank = QUESTION_ORDER.index(question.kind) if question.kind in QUESTION_ORDER else len(QUESTION_ORDER)
            ranked.append((rank, finding_index, question_index, question))
    ranked.sort(key=lambda item: item[:3])
    total = len(ranked)
    return [
        item[3].model_copy(update={"priority": float(total - position)})
        for position, item in enumerate(ranked)
    ]


def choose_pending(
    questions: list[FindingQuestion],
    *,
    limit: int = MAX_PENDING,
    per_kind_limit: int = MAX_PER_KIND,
) -> tuple[list[FindingQuestion], int]:
    """The few to put to the user now, with how many wait. Same limits as the engine's."""
    chosen: list[FindingQuestion] = []
    per_kind: dict[str, int] = defaultdict(int)
    for question in questions:
        if len(chosen) >= limit:
            break
        if per_kind[question.kind] >= per_kind_limit:
            continue
        per_kind[question.kind] += 1
        chosen.append(question)
    return chosen, len(questions) - len(chosen)
