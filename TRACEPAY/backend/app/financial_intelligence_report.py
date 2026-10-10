"""Authenticated assembly of one financial intelligence report."""

from __future__ import annotations

from dataclasses import dataclass

from app.financial_features import build_user_feature_snapshot
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.intelligence_report import (
    FinancialIntelligenceReport,
    ReportCompositionError,
    assemble_financial_intelligence_report,
)
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_models import LeakDetectionResult
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.recommendation_engine import recommend_actions

__all__ = [
    "FinancialIntelligenceRun",
    "ReportCompositionError",
    "build_user_financial_intelligence_report",
    "build_user_financial_intelligence_run",
]


@dataclass(frozen=True)
class FinancialIntelligenceRun:
    """Report plus the leaks from the same in-memory pass."""

    report: FinancialIntelligenceReport
    leaks: LeakDetectionResult


async def build_user_financial_intelligence_run(
    user_id: str,
    access_token: str,
) -> FinancialIntelligenceRun:
    """Run features, behaviour, leaks, reasoning, and recommendations once."""
    snapshot = await build_user_feature_snapshot(user_id, access_token)
    if snapshot.user_id != user_id:
        raise ReportCompositionError(
            "Financial intelligence report must stay within the authenticated user."
        )
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    if leaks.user_id != user_id:
        raise ReportCompositionError(
            "Financial intelligence report must stay within the authenticated user."
        )
    reasoning = analyze_financial_reasoning(snapshot, behaviours, leaks)
    recommendations = recommend_actions(reasoning)
    report = assemble_financial_intelligence_report(
        snapshot,
        behaviours,
        leaks,
        reasoning,
        recommendations,
    )
    return FinancialIntelligenceRun(report=report, leaks=leaks)


async def build_user_financial_intelligence_report(
    user_id: str,
    access_token: str,
) -> FinancialIntelligenceReport:
    """Run the existing pipeline once for the authenticated user."""
    return (await build_user_financial_intelligence_run(user_id, access_token)).report
