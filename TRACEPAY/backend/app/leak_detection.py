"""Authenticated composition of feature, behaviour, and leak detection layers."""

from __future__ import annotations

from app.financial_features import build_user_feature_inputs
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.leak_models import LeakDetectionResult


async def build_user_leak_detections(
    user_id: str, access_token: str
) -> LeakDetectionResult:
    """Calculate current potential leaks without persisting any user state."""
    transactions, snapshot = await build_user_feature_inputs(user_id, access_token)
    behaviours = analyze_behaviour(snapshot)
    return attach_supporting_transactions(detect_leaks(snapshot, behaviours), transactions)
