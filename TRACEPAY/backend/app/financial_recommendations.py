"""Authenticated composition of reasoning into non-automated recommendations."""

from __future__ import annotations

from app.financial_reasoning import build_user_financial_reasoning
from leak_intelligence.recommendation_engine import recommend_actions
from leak_intelligence.recommendation_models import FinancialRecommendationResult


async def build_user_financial_recommendations(
    user_id: str,
    access_token: str,
) -> FinancialRecommendationResult:
    """Reuse the canonical reasoning fetch, then derive recommendations from it."""
    reasoning = await build_user_financial_reasoning(user_id, access_token)
    if reasoning.user_id != user_id:
        raise ValueError("Financial recommendations must stay within the authenticated user.")
    return recommend_actions(reasoning)
