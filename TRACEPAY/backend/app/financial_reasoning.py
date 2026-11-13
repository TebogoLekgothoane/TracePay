"""Authenticated composition of the complete deterministic reasoning pipeline."""

from __future__ import annotations

from app.financial_features import build_user_feature_snapshot
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.reasoning_models import FinancialReasoningResult


async def build_user_financial_reasoning(
    user_id: str,
    access_token: str,
) -> FinancialReasoningResult:
    """Fetch canonical data once, then compose all deterministic analysis layers."""
    snapshot = await build_user_feature_snapshot(user_id, access_token)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    return analyze_financial_reasoning(snapshot, behaviours, leaks)
