from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..background_jobs import (
    JOB_ML_DETECT_ANOMALIES,
    JOB_ML_PREDICT_LEAKS,
    JobAcceptedResponse,
    enqueue_background_job,
)
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


@router.post(
    "/detect-anomalies",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def detect_anomalies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=1000, ge=1, le=5000),
) -> JobAcceptedResponse:
    """Queue anomaly detection on user transactions."""
    job = enqueue_background_job(
        db,
        JOB_ML_DETECT_ANOMALIES,
        current_user.id,
        {"limit": limit},
    )
    return JobAcceptedResponse(
        job_id=job.job_id,
        status=job.status,
        message="Anomaly detection queued. Poll /v1/jobs/{job_id} for status.",
    )


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


@router.post(
    "/predict-leaks",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def predict_future_leaks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobAcceptedResponse:
    """Queue prediction of potential future money leaks."""
    job = enqueue_background_job(
        db,
        JOB_ML_PREDICT_LEAKS,
        current_user.id,
        {},
    )
    return JobAcceptedResponse(
        job_id=job.job_id,
        status=job.status,
        message="Leak prediction queued. Poll /v1/jobs/{job_id} for status.",
    )
