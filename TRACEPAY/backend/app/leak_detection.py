"""Authenticated composition of feature, behaviour, and leak detection layers."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.financial_features import build_user_consolidated_inputs, fetch_printed_figure_rows
from app.finding_answers import load_finding_answers
from app.leak_detection_cache import UserResultCache
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.finding_overlap import (
    mark_explained_findings,
    split_for_display,
    summarise_impact,
)
from leak_intelligence.finding_questions import apply_answers, select_questions
from leak_intelligence.leak_claims import attach_claims
from leak_intelligence.leak_context import enrich_leaks
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.leak_evidence import _redact
from leak_intelligence.leak_models import LeakDetectionResult
from leak_intelligence.review_bridge import (
    SOURCE,
    combine_questions,
    merge_review,
    review_good_news,
    review_to_leaks,
)
from leak_intelligence.statement_review import (
    StatementReview,
    build_statement_review,
    context_from_printed_figures,
    money,
)
from leak_intelligence.statement_review_render import render_statement_review

logger = logging.getLogger("tracepay.leak_detection")

# Outside data that unlocks a question. A bank-account question is only worth
# asking once a verified fee schedule exists to compare against, so it stays
# off until one is added here.
REFERENCE_DATA: frozenset[str] = frozenset()


async def build_user_leak_detections(
    user_id: str, access_token: str
) -> LeakDetectionResult:
    """Calculate current potential leaks without persisting any user state.

    Findings are computed on the user's consolidated transactions across all
    accounts, then annotated with the accounts, date range, amount status and
    statement-coverage limits behind each one.
    """
    inputs = await build_user_consolidated_inputs(user_id, access_token)
    # The detectors are CPU-bound and the answers are read over the network; run
    # them off the event loop so one analysis does not stall every other request.
    detection = await asyncio.to_thread(_detect_all, inputs, user_id, access_token)
    return detection.result


async def build_user_statement_review(user_id: str, access_token: str) -> dict[str, object]:
    """The plain-language statement report: findings in groups, commitments, questions.

    Built from the same consolidated transactions as the leak detections, with the figures
    each statement printed (interest rate, limit, summary totals) and the user's earlier
    answers. A sentence that needs a figure that was not stored is left out, not guessed.
    """
    inputs = await build_user_consolidated_inputs(user_id, access_token)
    # The same single detection the leak list comes from, so the two can never disagree.
    detection = await asyncio.to_thread(_detect_all, inputs, user_id, access_token)
    review = detection.review
    # What the original detector found that the review does not cover. Findings the review
    # replaced, and the review's own, are not repeated here.
    others = [
        {
            "key": leak.leak_id,
            "title": leak.title,
            "description": leak.description,
            "leak_type": leak.leak_type,
            "group": leak.value_group,
            "monthly": money(leak.estimated_monthly_impact),
            "impact_kind": leak.impact_kind,
        }
        for leak in detection.result.leaks
        if leak.evidence.get("source") != SOURCE
    ]
    return {
        "report": render_statement_review(review, others),
        "other_findings": others,
        "transaction_count": review.transaction_count,
        "account_label": review.account_label,
        "account_count": review.account_count,
        "period_start": review.period_start.isoformat() if review.period_start else None,
        "period_end": review.period_end.isoformat() if review.period_end else None,
        "month_count": review.month_count,
        "facility": str(review.facility) if review.facility is not None else None,
        "reconciliation": review.reconciliation,
        "commitments": [{"name": row.name, "amount": row.amount} for row in review.commitments],
        "context_notes": review.context_notes,
        "near_misses": review.near_misses,
        "coverage_limits": review.coverage_limits,
        # The same questions as the leak list asks, under the same limit.
        "questions": [question.model_dump(mode="json") for question in detection.result.questions],
        "questions_not_shown": detection.result.questions_not_shown,
        "findings": [
            {
                "key": item.key,
                "group": item.group,
                "display": item.display,
                "type_note": item.type_note,
                "leak_type": item.leak_type,
                "title": item.title,
                "confidence": item.confidence,
                "confirmed": item.confirmed,
                "possible": item.possible,
                "cannot_see": item.cannot_see,
                "check": item.check,
                "shows": item.shows,
                "cannot_show": item.cannot_show,
                "line": item.line,
                # What the user told us, apart from what the rows show.
                "reported": item.reported,
                # The statement rows the figures are built from, so each can be checked.
                "rows": [
                    {
                        "date": row.date.isoformat(),
                        # Redacted like every other row the API returns: no reference numbers.
                        "description": _redact(row.description),
                        "amount": money(row.amount),
                        "direction": row.direction,
                        "role": row.role,
                    }
                    for row in item.rows
                ],
                "rows_total": item.rows_total,
            }
            # A finding the user's answers set aside is explained in the report's "not
            # raised" notes, not listed as a finding.
            for item in review.findings
            if item.status == "active"
        ],
    }


@dataclass
class Detection:
    """One run: the findings a customer sees, and the statement review they came partly from."""

    result: LeakDetectionResult
    review: StatementReview


def _load_answers(user_id: str, access_token: str) -> dict | None:
    """The user's answers, or None when they cannot be read.

    If they cannot be read, ask nothing: guessing which questions were already answered would
    repeat questions the user has dealt with.
    """
    try:
        return load_finding_answers(user_id, access_token)
    except Exception as error:
        logger.warning("finding_answers_unavailable error_type=%s", type(error).__name__)
        return None


def _detect_all(inputs, user_id: str, access_token: str) -> Detection:
    """The engine and the statement review as one list of findings.

    The review checks more in places and the engine knows things the review does not, so
    neither is dropped: see ``review_bridge``. The merged list then goes through the engine's
    own stages, so a review finding is enriched, explained and questioned like any other.
    """
    answers = _load_answers(user_id, access_token)
    labels = [account.label for account in inputs.accounts]
    figure_rows = fetch_printed_figure_rows(user_id, access_token)
    context = context_from_printed_figures(figure_rows, labels[0] if len(labels) == 1 else None)
    review = build_statement_review(
        inputs.transactions, context, answers or {}, ask_questions=answers is not None
    )

    behaviours = analyze_behaviour(inputs.snapshot)
    engine = attach_supporting_transactions(
        detect_leaks(inputs.snapshot, behaviours), inputs.transactions
    )
    merged = merge_review(engine, review_to_leaks(review, user_id), review_good_news(review))
    detected = attach_claims(mark_explained_findings(merged))
    enriched = enrich_leaks(
        detected,
        inputs.transactions,
        coverage=inputs.coverage,
        accounts=inputs.accounts,
    )
    # Totals see every finding, so an explained one is counted once; the customer
    # list then leaves out findings another finding already accounts for.
    enriched = enriched.model_copy(update={"impact_summary": summarise_impact(enriched.leaks)})
    result = split_for_display(enriched)
    if answers is not None:
        result = _attach_questions(result, answers, review.questions)
    return Detection(result=result, review=review)


leak_detection_cache: UserResultCache[LeakDetectionResult] = UserResultCache()


def invalidate_user_leak_detections(user_id: str) -> None:
    """Call wherever the backend changes data the leak result depends on."""
    leak_detection_cache.invalidate(user_id)


def _with_user_answers(
    result: LeakDetectionResult, user_id: str, access_token: str
) -> LeakDetectionResult:
    """Apply what the user told us and list the few questions still worth asking.

    If the answers cannot be read, ask nothing: guessing which questions were
    already answered would repeat questions the user has dealt with.
    """
    answers = _load_answers(user_id, access_token)
    if answers is None:
        return result
    return _attach_questions(result, answers, [])


def _attach_questions(result: LeakDetectionResult, answers: dict, review_questions: list) -> LeakDetectionResult:
    """The engine's questions and the review's, asked under one limit."""
    applied = apply_answers(result, answers)
    # All the engine's open questions, not only its top few, so they can be ranked with the review's.
    engine_open, _ = select_questions(
        applied.leaks,
        answers,
        reference_data=REFERENCE_DATA,
        limit=10_000,
        per_kind_limit=10_000,
    )
    questions, not_shown = combine_questions(engine_open, review_questions)
    return applied.model_copy(update={"questions": questions, "questions_not_shown": not_shown})
