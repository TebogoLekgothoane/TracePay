"""Aggregate, non-PII platform statistics.

Shared by the admin router (full detail) and the investor router (a
curated subset) so the underlying computation only lives in one place.
Nothing in here is ever scoped to or reveals a single identifiable user --
if a metric needs a `user_id` or `username`, it belongs in admin.py's own
queries instead, not here.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List

from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .models_db import AnalysisResult, FrozenItem, LinkedAccount, Profile, RegionalStat, Transaction


class OverviewStats(BaseModel):
    total_users: int
    active_users: int
    total_linked_accounts: int
    total_transactions: int
    total_analyses: int
    average_health_score: float
    total_frozen_items: int
    total_capital_protected: float
    active_consents: int
    ml_anomalies_detected: int
    mailbox_effect_prevalence: float
    avg_inclusion_score: int
    retail_wealth_unlock: float
    avg_inclusion_delta: float
    total_retail_velocity: float


class RegionalInsight(BaseModel):
    region: str
    average_health_score: float
    total_leaks: int
    total_users: int
    top_leak_type: str


def compute_overview_stats(db: Session) -> OverviewStats:
    total_users = db.query(Profile).count()

    # "Active" has no direct column now that identity lives in Supabase Auth
    # (which manages its own account status) -- defined here as distinct
    # users with a transaction or analysis in the last 30 days.
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    active_from_transactions = (
        db.query(Transaction.user_id)
        .filter(Transaction.created_at >= thirty_days_ago)
        .distinct()
    )
    active_from_analyses = (
        db.query(AnalysisResult.user_id)
        .filter(AnalysisResult.created_at >= thirty_days_ago)
        .distinct()
    )
    active_users = active_from_transactions.union(active_from_analyses).count()

    total_linked_accounts = db.query(LinkedAccount).count()
    total_transactions = db.query(Transaction).count()
    total_analyses = db.query(AnalysisResult).count()

    avg_score = db.query(func.avg(AnalysisResult.financial_health_score)).scalar() or 0.0
    total_frozen = db.query(FrozenItem).count()

    # Summing up estimated_monthly_cost from all money_leaks in AnalysisResult
    all_analyses = db.query(AnalysisResult).all()
    total_capital = 0.0
    mailbox_cases = 0
    total_inclusion_score = 0
    inclusion_count = 0
    total_inclusion_delta = 0.0
    total_retail_velocity = 0.0

    for a in all_analyses:
        if a.money_leaks:
            for leak in a.money_leaks:
                total_capital += leak.get("estimated_monthly_cost", 0.0)
                if leak.get("detector") == "MailboxEffect":
                    mailbox_cases += 1
                if leak.get("detector") == "InclusionScorer":
                    total_inclusion_score += leak.get("score", 0)
                    inclusion_count += 1
                if leak.get("detector") == "StakeholderMetrics":
                    total_inclusion_delta += leak.get("inclusion_delta", 0.0)
                    total_retail_velocity += leak.get("retail_velocity", 0.0)

    mailbox_prevalence = (mailbox_cases / total_analyses * 100) if total_analyses > 0 else 0.0
    avg_inclusion = (total_inclusion_score / inclusion_count) if inclusion_count > 0 else 0
    retail_wealth = total_capital * 0.75  # 75% of protected capital reclaimed for local retail

    active_consents = db.query(LinkedAccount).filter(LinkedAccount.open_banking_consent_id.isnot(None)).count()

    ml_anomalies = 0
    for analysis in all_analyses:
        for leak in analysis.money_leaks or []:
            detector = str(leak.get("detector", "")).lower()
            severity = str(leak.get("severity", "")).lower()
            if "anomaly" in detector or severity == "anomaly":
                ml_anomalies += 1

    return OverviewStats(
        total_users=total_users,
        active_users=active_users,
        total_linked_accounts=total_linked_accounts,
        total_transactions=total_transactions,
        total_analyses=total_analyses,
        average_health_score=round(float(avg_score), 2),
        total_frozen_items=total_frozen,
        total_capital_protected=round(total_capital, 2),
        active_consents=active_consents,
        ml_anomalies_detected=ml_anomalies,
        mailbox_effect_prevalence=round(mailbox_prevalence, 1),
        avg_inclusion_score=int(avg_inclusion),
        retail_wealth_unlock=round(retail_wealth, 2),
        avg_inclusion_delta=round(total_inclusion_delta / max(total_analyses, 1), 1),
        total_retail_velocity=round(total_retail_velocity, 2),
    )


def compute_regional_stats(db: Session) -> List[RegionalInsight]:
    rows = (
        db.query(RegionalStat)
        .order_by(RegionalStat.region.asc(), RegionalStat.created_at.desc())
        .all()
    )
    if not rows:
        return []

    by_region: dict[str, dict[str, float]] = {}
    for row in rows:
        metrics = by_region.setdefault(row.region, {})
        if row.metric_name not in metrics:
            metrics[row.metric_name] = row.value

    insights: List[RegionalInsight] = []
    for region, metrics in sorted(by_region.items()):
        insights.append(
            RegionalInsight(
                region=region,
                average_health_score=round(float(metrics.get("average_health_score", 0.0)), 1),
                total_leaks=int(metrics.get("total_leaks", 0)),
                total_users=int(metrics.get("total_users", 0)),
                top_leak_type="Not available",
            )
        )

    return insights
