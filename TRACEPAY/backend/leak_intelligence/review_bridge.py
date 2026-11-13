"""One list of findings: the statement review's, merged into the leak engine's.

The statement review checks more than the engine in places (a debit that doubled when no
month was missed, the same charge twice in two months running, a price that moved, fees by
source), and the engine knows things the review does not (categories, merchant memory,
spending patterns). They used to disagree. This module makes them one:

* each review finding becomes an engine finding, carrying the exact rows it was built from and
  its own confirmed / possible / cannot-see wording, so the engine's later stages (overlap,
  enrichment, saved findings, notifications) treat it like any other;
* an engine finding is replaced only when at least half of its transactions belong to a review
  finding of the same kind: the same rows, said once, by the rule that checks more;
* an engine finding the review does not cover stays, so nothing the engine catches is lost;
* a near-miss that says "not raised" about something the review did raise is dropped;
* a price that fell is not a finding, so it goes in ``good_news``;
* the questions of both are asked under one limit.

Nothing is dropped by name: only by shared transactions.
"""

from __future__ import annotations

import re
from datetime import datetime, time, timezone
from decimal import Decimal
from typing import Iterable

from .finding_questions import MAX_PENDING, MAX_PER_KIND
from .leak_evidence import _redact
from .leak_keys import leak_fingerprint, subject_key
from .leak_models import (
    ConfirmedFact,
    FindingQuestion,
    GoodNewsItem,
    LeakClaims,
    LeakDetection,
    LeakDetectionResult,
    PossibleLeak,
    ReportedFact,
    SupportingTransaction,
)
from .leak_scoring import severity_for_impact
from .statement_review import EvidenceRow, ReviewFinding, StatementReview
from .statement_review_answers import QUESTION_ORDER

SOURCE = "statement_review"
# A separate version so a review finding's id never collides with an engine finding's.
REVIEW_DETECTOR_VERSION = "review-1"
# Engine findings and review findings are compared only within one kind of finding.
_FAMILIES: dict[str, str] = {
    **dict.fromkeys(
        (
            "subscription_leak",
            "recurring_payment_leak",
            "unknown_recurring_payment",
            "overlapping_cover_leak",
            "duplicate_streaming_leak",
            "inactive_recurring_payment_leak",
        ),
        "recurring",
    ),
    **dict.fromkeys(("bank_fee_leak", "penalty_fee_leak", "high_cost_credit_leak"), "fees"),
    **dict.fromkeys(("duplicate_payment_leak", "duplicate_debit_order_leak"), "duplicates"),
    "irregular_transaction_leak": "irregular",
    **dict.fromkeys(("recurring_transfer_leak", "money_pass_through_leak"), "transfers"),
    **dict.fromkeys(
        (
            "food_spending_leak",
            "transport_spending_leak",
            "coffee_spending_leak",
            "convenience_store_leak",
            "weekend_spending_leak",
            "payday_spending_leak",
            "spending_escalation_leak",
            "airtime_data_leak",
            "gambling_spending_leak",
            "cash_usage_leak",
        ),
        "spending",
    ),
}
# At least this share of an engine finding's rows must be a review finding's rows.
SUPERSEDE_SHARE = Decimal("0.5")

# What a pattern allows us to say before the user has told us anything.
_DEFAULT_POSSIBLE = {
    "duplicate_payment_leak": "You may have been charged twice for the same thing.",
    "duplicate_debit_order_leak": "You may have been charged more than your regular amount.",
}
_GENERIC_POSSIBLE = "The statements show the pattern above, not the reason for it."

_CONFIDENCE = {"high": 0.85, "medium": 0.7, "medium-low": 0.55, "low": 0.45}
# How firm each finding's evidence is: arithmetic on the rows, a pattern in them, or a guess.
_EVIDENCE_STATUS = {
    "price_rise": "confirmed",
    "overdraft_interest": "confirmed",
    "bank_fees": "confirmed",
    "double_debit": "likely",
    "paired": "likely",
    "opaque_billing": "likely",
    "round_trip_transfers": "likely",
    "food_delivery": "likely",
    "insurers": "possible",
    "cloud_overlap": "possible",
    "unknown_recurring": "possible",
    "optional_charge": "possible",
}
_FEE_ROLES = {"service charge", "cross-border fee", "payment fee", "interest"}


def _plain(text: str, limit: int = 500) -> str:
    cleaned = re.sub(r"\s+", " ", text.replace("**", "").replace("`", "")).strip()
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


def _prefix(finding: ReviewFinding) -> str:
    return finding.key.split(":", 1)[0]


def _impact(finding: ReviewFinding, months: int) -> tuple[Decimal, Decimal | None, str]:
    """(monthly, annual, kind). Zero where the finding makes no cost claim."""
    figures = finding.figures
    months = max(months, 1)

    def money(name: str) -> Decimal:
        value = figures.get(name)
        return Decimal(str(value)) if value is not None else Decimal("0")

    prefix = _prefix(finding)
    if prefix in {"double_debit", "paired"}:
        return money("extra"), None, "one_time"
    if prefix == "price_rise":
        step = money("step")
        return step, step * 12, "recurring"
    if prefix in {"overdraft_interest", "bank_fees", "opaque_billing", "food_delivery"}:
        monthly = (money("total") / months).quantize(Decimal("0.01"))
        return monthly, monthly * 12, "recurring"
    if prefix == "insurers":
        monthly = money("monthly")
        return monthly, monthly * 12, "recurring"
    if prefix == "cloud_overlap":
        monthly = money("monthly")
        return monthly, monthly * 12, "recurring"
    if prefix in {"unknown_recurring", "optional_charge"}:
        monthly = money("amount")
        return monthly, monthly * 12, "recurring"
    if prefix == "airtime":
        return (money("total") / months).quantize(Decimal("0.01")), None, "estimated"
    if prefix == "escalation":
        return max(money("last") - money("first"), Decimal("0")), None, "estimated"
    if prefix in {"large_one_off", "repeat_payment"}:
        return money("amount"), None, "one_time"
    return Decimal("0"), None, "estimated"  # a pattern worth knowing, with no cost claimed


def _json_safe(figures: dict[str, object]) -> dict[str, object]:
    safe: dict[str, object] = {}
    for key, value in figures.items():
        if isinstance(value, Decimal):
            safe[key] = str(value)
        elif isinstance(value, list) and all(isinstance(item, (str, int, Decimal)) for item in value):
            safe[key] = [str(item) if isinstance(item, Decimal) else item for item in value]
        elif isinstance(value, (str, int, float, bool)) or value is None:
            safe[key] = value
    return safe


def _support(rows: Iterable[EvidenceRow]) -> list[SupportingTransaction]:
    return [
        SupportingTransaction(
            transaction_id=row.transaction_id,
            date=row.date,
            description=_redact(row.description),
            # A supporting row carries a magnitude; ``direction`` says which way it went.
            # Statement rows can hold a signed amount (a debit of -124.99), which the
            # model rejects, and that turned /leak-detections into a 500.
            amount=abs(row.amount),
            direction=row.direction,
            role="fee" if row.role in _FEE_ROLES else "payment",
        )
        for row in rows
    ]


def _claims(finding: ReviewFinding) -> LeakClaims:
    if finding.display == "card":
        confirmed = [ConfirmedFact(text=_plain(text)) for text in finding.confirmed]
        possible = [
            PossibleLeak(text=_plain(text), cannot_see=[_plain(c) for c in finding.cannot_see], check=finding.check and _plain(finding.check))
            for text in finding.possible
        ]
        if not possible and (finding.cannot_see or finding.check):
            possible = [
                PossibleLeak(
                    text=_DEFAULT_POSSIBLE.get(finding.leak_type, _GENERIC_POSSIBLE),
                    cannot_see=[_plain(c) for c in finding.cannot_see],
                    check=finding.check and _plain(finding.check),
                )
            ]
    elif finding.display == "item":
        confirmed = [ConfirmedFact(text=_plain(finding.line))]
        possible = []
    else:
        confirmed = [ConfirmedFact(text=_plain(finding.shows))]
        possible = [
            PossibleLeak(
                text=_DEFAULT_POSSIBLE.get(finding.leak_type, _GENERIC_POSSIBLE),
                cannot_see=[_plain(finding.cannot_show)] if finding.cannot_show else [],
            )
        ]
    kind = finding.questions[0].kind if finding.questions else "review"
    reported = [
        ReportedFact(text="You told us: " + item[0].upper() + item[1:], question_kind=kind, answer="reported")
        for item in finding.reported
    ]
    return LeakClaims(confirmed=confirmed, reported=reported, possible=possible, user_effect="none")


def review_to_leaks(review: StatementReview, user_id: str) -> list[LeakDetection]:
    """Every active review finding that is a finding, as an engine finding.

    A price that fell is not one (see ``review_good_news``), and neither is a note or a
    commitment: the commitments are not leaks and stay in the report.
    """
    detected_at = datetime.combine(
        review.period_end or review.period_start or datetime.now(timezone.utc).date(),
        time.min,
        tzinfo=timezone.utc,
    )
    leaks = []
    for finding in review.findings:
        if finding.status != "active" or finding.group not in {"recoverable", "review"}:
            continue
        monthly, annual, kind = _impact(finding, review.month_count)
        confidence = _CONFIDENCE.get(finding.confidence, 0.7)
        prefix = _prefix(finding)
        fingerprint = leak_fingerprint(
            user_id=user_id,
            leak_type=finding.leak_type,
            subject_key=subject_key(f"review-{finding.key}"),
            detector_version=REVIEW_DETECTOR_VERSION,
        )
        evidence: dict[str, object] = {
            **_json_safe(finding.figures),
            "source": SOURCE,
            "review_key": finding.key,
            "review_display": finding.display,
            "finding_focus": prefix,
            "evidence_status": _EVIDENCE_STATUS.get(prefix, "possible"),
            "evidence_status_reason": "Worked out from the statement rows listed with this finding.",
            "observation_count": finding.rows_total,
            "transaction_evidence": "attached" if finding.rows else "insufficient",
        }
        if prefix == "price_rise":
            evidence.update(
                headline_impact_basis="price_increase",
                original_recurring_amount=str(finding.figures.get("old")),
                latest_amount=str(finding.figures.get("new")),
                typical_amount=str(finding.figures.get("old")),
            )
        description = _plain(
            finding.confirmed[0] if finding.confirmed else finding.shows or finding.line or finding.title
        )
        leaks.append(
            LeakDetection(
                leak_id=fingerprint,
                fingerprint=fingerprint,
                leak_type=finding.leak_type,  # type: ignore[arg-type]
                title=_plain(finding.title, 200),
                description=description,
                severity=severity_for_impact(monthly, persistent=kind == "recurring", confidence=confidence),  # type: ignore[arg-type]
                confidence=confidence,
                estimated_monthly_impact=monthly,
                estimated_annual_impact=annual,
                impact_kind=kind,  # type: ignore[arg-type]
                evidence=evidence,
                supporting_feature_references=["statement_review"],
                supporting_transactions=_support(finding.rows),
                supporting_transaction_count=finding.rows_total,
                detector_version=REVIEW_DETECTOR_VERSION,
                detected_at=detected_at,
                period_start=review.period_start,
                period_end=review.period_end,
                claims=_claims(finding),
                value_group=finding.group,  # type: ignore[arg-type]
            )
        )
    return leaks


def review_good_news(review: StatementReview) -> list[GoodNewsItem]:
    return [
        GoodNewsItem(key=item.key, title=item.title, line=item.line)
        for item in review.by_group("good_news")
        if item.line
    ]


# ------------------------------------------------------------------------------ merging


def _row_ids(leak: LeakDetection) -> set[str]:
    return {
        row.transaction_id
        for row in leak.supporting_transactions
        if row.role in {"payment", "fee"}
    }


def _superseded_by(engine_leak: LeakDetection, review_leaks: list[LeakDetection]) -> LeakDetection | None:
    """The review finding that already says this, from the same rows, or None."""
    family = _FAMILIES.get(engine_leak.leak_type)
    ids = _row_ids(engine_leak)
    if family is None or not ids:
        return None
    best: tuple[Decimal, LeakDetection] | None = None
    for candidate in review_leaks:
        if _FAMILIES.get(candidate.leak_type) != family:
            continue
        share = Decimal(len(ids & _row_ids(candidate))) / Decimal(len(ids))
        if share >= SUPERSEDE_SHARE and (best is None or share > best[0]):
            best = (share, candidate)
    return best[1] if best else None


# A near-miss reason that a review finding contradicts when it raised that very thing.
_CONTRADICTED = {
    "multiple_of_regular_amount": "double_debit",
    "repeated_routine": "paired",
}


def _contradicted(miss, review_leaks: list[LeakDetection]) -> bool:
    """A near-miss about rows that a review finding of the opposite verdict is built from.

    Matched by amount and date, never by name: the engine's merchant label and the statement's
    own spelling ("VIRGIN ACTIVE" against "VIRGIN ACT NETCASH") rarely agree.
    """
    prefix = _CONTRADICTED.get(miss.reason_code)
    if prefix is None:
        return False
    days = {str(day) for day in miss.dates}
    amount = Decimal(str(miss.amount))
    return any(
        leak.evidence.get("finding_focus") == prefix
        and any(
            row.amount == amount and (not days or row.date.isoformat() in days)
            for row in leak.supporting_transactions
        )
        for leak in review_leaks
    )


def merge_review(
    engine: LeakDetectionResult,
    review_leaks: list[LeakDetection],
    good_news: list[GoodNewsItem],
) -> LeakDetectionResult:
    """The engine's findings and the review's as one list. Engine findings must already carry
    their supporting rows (``attach_supporting_transactions``), because that is how they are
    compared."""
    kept: list[LeakDetection] = []
    for leak in engine.leaks:
        owner = _superseded_by(leak, review_leaks)
        if owner is None:
            kept.append(leak)
            continue
        # Hidden from the list, not deleted: the result still shows what was replaced and by what.
        kept.append(
            leak.model_copy(
                update={
                    "evidence": {
                        **leak.evidence,
                        "explained_by_leak_ids": [owner.leak_id],
                        "redundant_for_display": True,
                        "superseded_by_review": owner.evidence.get("review_key"),
                    }
                }
            )
        )
    merged = sorted([*kept, *review_leaks], key=lambda item: (-item.confidence, item.leak_id))
    near_misses = [miss for miss in engine.near_misses if not _contradicted(miss, review_leaks)]
    return engine.model_copy(
        update={"leaks": merged, "near_misses": near_misses, "good_news": good_news}
    )


# ------------------------------------------------------------------------------ questions


def combine_questions(
    engine_questions: list[FindingQuestion],
    review_open: list[FindingQuestion],
) -> tuple[list[FindingQuestion], int]:
    """Every open question from both, ranked by what it could change, under the engine's limits.

    ``engine_questions`` must be all of the engine's open questions, not only the few it would
    ask by itself, so a generic one can never crowd out a question with money at stake. The
    order is the same for both sources: was it charged twice, is it still billing, who is it,
    what is covered, where does the money sit, do you use it. Within one kind the engine's
    own priority comes first. A question both ask is asked once. Returns the few to ask now
    and how many are waiting.
    """
    pool: dict[str, FindingQuestion] = {}
    for question in [*engine_questions, *review_open]:
        pool.setdefault(question.question_key, question)

    def rank(question: FindingQuestion) -> tuple[int, float, str]:
        kind_rank = QUESTION_ORDER.index(question.kind) if question.kind in QUESTION_ORDER else len(QUESTION_ORDER)
        return kind_rank, -question.priority, question.question_key

    chosen: list[FindingQuestion] = []
    per_kind: dict[str, int] = {}
    for question in sorted(pool.values(), key=rank):
        if len(chosen) >= MAX_PENDING:
            break
        if per_kind.get(question.kind, 0) >= MAX_PER_KIND:
            continue
        per_kind[question.kind] = per_kind.get(question.kind, 0) + 1
        chosen.append(question)
    return chosen, len(pool) - len(chosen)
