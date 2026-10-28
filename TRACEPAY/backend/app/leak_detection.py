"""Authenticated composition of feature, behaviour, and leak detection layers."""

from __future__ import annotations

import logging

from app.financial_features import build_user_consolidated_inputs
from app.finding_answers import load_finding_answers
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.finding_questions import attach_questions
from leak_intelligence.leak_claims import attach_claims
from leak_intelligence.leak_context import enrich_leaks
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.leak_models import LeakDetectionResult

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
    behaviours = analyze_behaviour(inputs.snapshot)
    detected = attach_claims(
        attach_supporting_transactions(
            detect_leaks(inputs.snapshot, behaviours), inputs.transactions
        )
    )
    enriched = enrich_leaks(
        detected,
        inputs.transactions,
        coverage=inputs.coverage,
        accounts=inputs.accounts,
    )
    return _with_user_answers(enriched, user_id, access_token)


def _with_user_answers(
    result: LeakDetectionResult, user_id: str, access_token: str
) -> LeakDetectionResult:
    """Apply what the user told us and list the few questions still worth asking.

    If the answers cannot be read, ask nothing: guessing which questions were
    already answered would repeat questions the user has dealt with.
    """
    try:
        answers = load_finding_answers(user_id, access_token)
    except Exception as error:
        logger.warning("finding_answers_unavailable error_type=%s", type(error).__name__)
        return result
    return attach_questions(result, answers, reference_data=REFERENCE_DATA)
