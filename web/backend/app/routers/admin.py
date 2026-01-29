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


class RegionalInsight(BaseModel):
    region: str
    average_health_score: float
    total_leaks: int
    total_users: int
    top_leak_type: str


@router.get("/stats/overview", response_model=OverviewStats)
def get_overview_stats(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> OverviewStats:
    """Get overall platform statistics"""
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    total_linked_accounts = db.query(LinkedAccount).count()
    total_transactions = db.query(Transaction).count()
    total_analyses = db.query(AnalysisResult).count()

    # Average health score
    avg_score = db.query(func.avg(AnalysisResult.financial_health_score)).scalar() or 0.0

    # Total frozen items
    total_frozen = db.query(FrozenItem).count()

    return OverviewStats(
        total_users=total_users,
        active_users=active_users,
        total_linked_accounts=total_linked_accounts,
        total_transactions=total_transactions,
        total_analyses=total_analyses,
        average_health_score=round(float(avg_score), 2),
        total_frozen_items=total_frozen,
    )


@router.get("/stats/regional", response_model=List[RegionalInsight])
def get_regional_stats(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> List[RegionalInsight]:
    """Get regional leakage trends"""
    # For now, we'll use mock regional data
    # In production, you'd aggregate by user location or account region
    regions = ["East London", "Mthatha", "Port Elizabeth", "King William's Town", "Butterworth"]

    insights = []
    for region in regions:
        # Mock data - in production, calculate from actual user data
        insights.append(
            RegionalInsight(
                region=region,
                average_health_score=65.0,  # Would calculate from actual data
                total_leaks=150,  # Would count from actual data
                total_users=50,  # Would count from actual data
                top_leak_type="Airtime Drains",  # Would calculate from actual data
            )
        )

    return insights


@router.get("/stats/temporal")
def get_temporal_stats(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
) -> Dict[str, Any]:
    """Get time-based trends"""
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

