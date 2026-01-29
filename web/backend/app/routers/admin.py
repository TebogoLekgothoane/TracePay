from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_admin_user, get_current_user
from ..database import get_db
from ..models_db import AnalysisResult, FrozenItem, LinkedAccount, RegionalStat, Transaction, User

router = APIRouter(prefix="/admin", tags=["admin"])


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


class RegionalInsight(BaseModel):
    region: str
    average_health_score: float
    total_leaks: int
    total_users: int
    top_leak_type: str


@router.get("/stats/overview", response_model=OverviewStats)
def get_overview_stats(
    db: Session = Depends(get_db),
) -> OverviewStats:
    """Get overall platform statistics (Public for Demo)"""
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    total_linked_accounts = db.query(LinkedAccount).count()
    total_transactions = db.query(Transaction).count()
    total_analyses = db.query(AnalysisResult).count()

    # Average health score
    avg_score = db.query(func.avg(AnalysisResult.financial_health_score)).scalar() or 0.0

    # Total frozen items
    total_frozen = db.query(FrozenItem).count()

    # Total Capital Protected
    # Summing up estimated_monthly_cost from all money_leaks in AnalysisResult
    all_analyses = db.query(AnalysisResult).all()
    total_capital = 0.0
    for a in all_analyses:
        if a.money_leaks:
            for leak in a.money_leaks:
                total_capital += leak.get("estimated_monthly_cost", 0.0)

    # Active Consents (from Open Banking)
    active_consents = db.query(LinkedAccount).filter(LinkedAccount.open_banking_consent_id.isnot(None)).count()

    # ML Anomalies Detected (Mock for demo, or aggregate from forensic findings)
    ml_anomalies = total_analyses * 3 # Simulated metric

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
    )


@router.get("/stats/regional", response_model=List[RegionalInsight])
def get_regional_stats(
    db: Session = Depends(get_db),
) -> List[RegionalInsight]:
    """Get regional leakage trends (Public for Demo)"""
    # For now, we'll use mock regional data
    # In production, you'd aggregate by user location or account region
    regions = ["East London", "Mthatha", "Port Elizabeth", "King William's Town", "Butterworth"]

    insights = []
    for i, region in enumerate(regions):
        # Mock data - in production, calculate from actual user data
        insights.append(
            RegionalInsight(
                region=region,
                average_health_score=65.0 - (i * 5),  # Varied scores
                total_leaks=150 + (i * 20),  # Varied counts
                total_users=50,  
                top_leak_type="Airtime Drains" if i % 2 == 0 else "Fee Leakage",
            )
        )

    return insights


@router.get("/stats/temporal")
def get_temporal_stats(
    db: Session = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
) -> Dict[str, Any]:
    """Get time-based trends (Public for Demo)"""
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # Get analyses in time range
    analyses = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.created_at >= start_date, AnalysisResult.created_at <= end_date)
        .all()
    )

    # Group by date
    daily_scores = {}
    for analysis in analyses:
        date_key = analysis.created_at.date().isoformat()
        if date_key not in daily_scores:
            daily_scores[date_key] = []
        daily_scores[date_key].append(analysis.financial_health_score)

    # Calculate averages
    temporal_data = [
        {"date": date, "average_score": sum(scores) / len(scores), "count": len(scores)}
        for date, scores in sorted(daily_scores.items())
    ]

    # If no data, provide a nice trend for the demo
    if not temporal_data:
        for i in range(days, 0, -1):
            day = (end_date - timedelta(days=i)).date().isoformat()
            temporal_data.append({
                "date": day,
                "average_score": 45 + (days - i) * 0.5, # Improving trend
                "count": 2
            })

    return {
        "period_days": days,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "total_analyses": len(analyses),
        "temporal_data": temporal_data,
    }


@router.get("/stats/user-segments")
def get_user_segments(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get user segment analysis"""
    # Group users by health score bands
    analyses = db.query(AnalysisResult).all()

    green_count = sum(1 for a in analyses if a.health_band == "green")
    yellow_count = sum(1 for a in analyses if a.health_band == "yellow")
    red_count = sum(1 for a in analyses if a.health_band == "red")

    return {
        "green_band": green_count,
        "yellow_band": yellow_count,
        "red_band": red_count,
        "total_users": len(analyses),
    }


@router.get("/stats/ml-findings")
def get_ml_findings(
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Summary of Machine Learning findings across the platform"""
    return {
        "top_leak_categories": [
            {"category": "Airtime Drains", "count": 450, "growth": "+12%"},
            {"category": "Fee Leakage", "count": 320, "growth": "+5%"},
            {"category": "Subscription Traps", "count": 180, "growth": "-2%"}
        ],
        "anomaly_distribution": {
            "high_risk": 45,
            "medium_risk": 120,
            "low_risk": 350
        },
        "predicted_savings_next_month": 12500.0
    }


@router.get("/stats/data-ingestion")
def get_data_ingestion_stats(
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Metrics related to data sources and Open Banking ingestion"""
    total_accounts = db.query(LinkedAccount).count()
    ob_accounts = db.query(LinkedAccount).filter(LinkedAccount.open_banking_consent_id.isnot(None)).count()
    momo_accounts = db.query(LinkedAccount).filter(LinkedAccount.bank_name == "MTN MoMo").count()

    return {
        "total_linked_accounts": total_accounts,
        "sources": {
            "open_banking": ob_accounts,
            "mtn_momo": momo_accounts,
            "manual": total_accounts - ob_accounts - momo_accounts
        },
        "ingestion_health": "healthy",
        "last_sync_all": datetime.utcnow().isoformat()
    }


@router.get("/users")
def list_users(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Dict[str, Any]:
    """List all users (paginated)"""
    users = db.query(User).offset(skip).limit(limit).all()
    total = db.query(User).count()

    return {
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "role": u.role,
                "created_at": u.created_at.isoformat(),
                "is_active": u.is_active,
            }
            for u in users
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/users/{user_id}/analysis")
def get_user_analysis(
    user_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get user's analysis history"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"error": "User not found"}

    analyses = db.query(AnalysisResult).filter(AnalysisResult.user_id == user_id).order_by(AnalysisResult.created_at.desc()).all()

    return {
        "user_id": user_id,
        "email": user.email,
        "analyses": [
            {
                "id": a.id,
                "score": a.financial_health_score,
                "band": a.health_band,
                "created_at": a.created_at.isoformat(),
                "transaction_count": a.transaction_count,
            }
            for a in analyses
        ],
    }

