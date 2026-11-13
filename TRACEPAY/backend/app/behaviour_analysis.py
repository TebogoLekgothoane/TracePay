"""Authenticated composition of feature extraction and behaviour analysis."""

from __future__ import annotations

from app.financial_features import build_user_feature_snapshot
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.behaviour_models import BehaviourAnalysisResult


async def build_user_behaviour_analysis(
    user_id: str, access_token: str
) -> BehaviourAnalysisResult:
    """Build one authenticated user's behaviour observations from canonical data."""
    snapshot = await build_user_feature_snapshot(user_id, access_token)
    return analyze_behaviour(snapshot)
