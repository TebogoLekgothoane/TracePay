"""Authenticated composition of feature, behaviour, and leak detection layers."""

from __future__ import annotations

from app.financial_features import build_user_consolidated_inputs
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.leak_context import enrich_leaks
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.leak_models import LeakDetectionResult


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
    detected = attach_supporting_transactions(
        detect_leaks(inputs.snapshot, behaviours), inputs.transactions
    )
    return enrich_leaks(
        detected,
        inputs.transactions,
        coverage=inputs.coverage,
        accounts=inputs.accounts,
    )
