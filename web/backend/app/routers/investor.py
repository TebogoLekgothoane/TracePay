from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_investor_user
from ..database import get_db
from ..stats import RegionalInsight, compute_overview_stats, compute_regional_stats

router = APIRouter(
    prefix="/investor",
    tags=["investor"],
    dependencies=[Depends(get_current_investor_user)],
)

# Presentational subset of admin's OverviewStats -- growth and impact only.
# Deliberately excludes anything ops/product-debug-flavored (ml_anomalies,
# mailbox_effect_prevalence, active_consents, inclusion scoring) and, more
# importantly, excludes every endpoint that names an individual user
# (admin's /users, /forensic-feed, /users/{id}/analysis stay admin-only).


class InvestorOverview(BaseModel):
    total_users: int
    active_users: int
    total_analyses: int
    average_health_score: float
    total_capital_protected: float
    total_frozen_items: int


@router.get("/overview", response_model=InvestorOverview)
def get_investor_overview(db: Session = Depends(get_db)) -> InvestorOverview:
    """Growth and impact metrics -- no individual user is ever identifiable here."""
    full = compute_overview_stats(db)
    return InvestorOverview(
        total_users=full.total_users,
        active_users=full.active_users,
        total_analyses=full.total_analyses,
        average_health_score=full.average_health_score,
        total_capital_protected=full.total_capital_protected,
        total_frozen_items=full.total_frozen_items,
    )


@router.get("/regional", response_model=List[RegionalInsight])
def get_investor_regional(db: Session = Depends(get_db)) -> List[RegionalInsight]:
    """Region-level aggregates -- same data admin sees, already has no PII."""
    return compute_regional_stats(db)
