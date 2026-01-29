from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models_db import Transaction, User
from ..ml_engine import MLEngine

router = APIRouter(prefix="/ml", tags=["machine learning"])

ml_engine = MLEngine()


class AnomalyResponse(BaseModel):
    anomalies: List[str]
    anomaly_scores: Dict[str, float]
    anomaly_count: int
    total_transactions: int


@router.post("/detect-anomalies", response_model=AnomalyResponse)
def detect_anomalies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 1000,
) -> AnomalyResponse:
    """Run anomaly detection on user transactions"""
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .order_by(Transaction.timestamp.desc())
        .limit(limit)
        .all()
    )

    if not transactions:
        return AnomalyResponse(anomalies=[], anomaly_scores={}, anomaly_count=0, total_transactions=0)

    # Convert to dict format
    txn_dicts = [
        {
            "id": t.id,
            "timestamp": t.timestamp.isoformat(),
            "amount": t.amount,
            "description": t.description,
            "merchant": t.merchant,
            "category": t.category,
            "direction": t.direction,
        }
        for t in transactions
    ]

    result = ml_engine.detect_anomalies(txn_dicts)
    return AnomalyResponse(**result)


@router.get("/user-cluster")
def get_user_cluster(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get user's spending profile cluster"""
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .order_by(Transaction.timestamp.desc())
        .limit(500)
        .all()
    )

    if not transactions:
        return {"cluster_id": -1, "cluster_profile": "insufficient_data"}

    txn_dicts = [
        {
            "id": t.id,
            "timestamp": t.timestamp.isoformat(),
            "amount": t.amount,
            "description": t.description,
            "merchant": t.merchant,
        }
        for t in transactions
    ]

    return ml_engine.cluster_users(txn_dicts)


@router.post("/predict-leaks")
def predict_future_leaks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Predict potential future money leaks"""
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .order_by(Transaction.timestamp.desc())
        .limit(500)
        .all()
    )

    if not transactions:
        return {"predicted_leaks": [], "confidence": 0.0}

    txn_dicts = [
        {
            "id": t.id,
            "timestamp": t.timestamp.isoformat(),
            "amount": t.amount,
            "description": t.description,
        }
        for t in transactions
    ]

    # Get historical leaks (from analysis results)
    from ..models_db import AnalysisResult

    analyses = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.user_id == current_user.id)
        .order_by(AnalysisResult.created_at.desc())
        .limit(10)
        .all()
    )

    historical_leaks = []
    for analysis in analyses:
        if analysis.money_leaks:
            historical_leaks.extend(analysis.money_leaks)

    return ml_engine.predict_future_leaks(txn_dicts, historical_leaks)

