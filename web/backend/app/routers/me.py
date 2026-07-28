from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, get_current_user
from ..database import get_db
from ..forensic_engine import ForensicEngine
from ..models import AnalyzeRequest
from ..models_db import (
    AccountSettings,
    AnalysisResult,
    FrozenItem,
    LinkedAccount,
    Partner,
    Profile,
    Redemption,
)

router = APIRouter(prefix="/me", tags=["me"])
forensic_engine = ForensicEngine()

# These detectors annotate an analysis with platform-level metadata (used by
# the admin overview's aggregate metrics) rather than describing an actual
# leak a person should see or act on.
_METADATA_ONLY_DETECTORS = {"InclusionScorer", "StakeholderMetrics", "DataSource"}


class AnalysisSummary(BaseModel):
    id: int
    financial_health_score: int
    health_band: str
    money_leaks: List[Dict[str, Any]]
    summary_plain_language: str
    transaction_count: int
    created_at: str


class MeSummary(BaseModel):
    financial_health_score: Optional[int]
    health_band: Optional[str]
    leaks_found: int
    potential_monthly_savings: float
    linked_accounts_count: int
    frozen_items_count: int
    last_analyzed_at: Optional[str]


AccountType = Literal["individual", "business"]


class MyAccountSettings(BaseModel):
    account_type: AccountType
    business_name: Optional[str]


class UpdateAccountSettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account_type: AccountType
    business_name: Optional[str] = None


def _visible_leaks(money_leaks: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    return [
        leak
        for leak in (money_leaks or [])
        if leak.get("detector") not in _METADATA_ONLY_DETECTORS
    ]


@router.get("/summary", response_model=MeSummary)
def get_my_summary(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeSummary:
    """The caller's own financial health snapshot -- never another user's."""
    latest = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.user_id == current_user.id)
        .order_by(AnalysisResult.created_at.desc())
        .first()
    )
    linked_accounts_count = (
        db.query(LinkedAccount).filter(LinkedAccount.user_id == current_user.id).count()
    )
    frozen_items_count = (
        db.query(FrozenItem).filter(FrozenItem.user_id == current_user.id).count()
    )

    if latest is None:
        return MeSummary(
            financial_health_score=None,
            health_band=None,
            leaks_found=0,
            potential_monthly_savings=0.0,
            linked_accounts_count=linked_accounts_count,
            frozen_items_count=frozen_items_count,
            last_analyzed_at=None,
        )

    leaks = _visible_leaks(latest.money_leaks)
    savings = sum(float(leak.get("estimated_monthly_cost", 0.0) or 0.0) for leak in leaks)

    return MeSummary(
        financial_health_score=latest.financial_health_score,
        health_band=latest.health_band,
        leaks_found=len(leaks),
        potential_monthly_savings=round(savings, 2),
        linked_accounts_count=linked_accounts_count,
        frozen_items_count=frozen_items_count,
        last_analyzed_at=latest.created_at.isoformat(),
    )


@router.post("/analyze", response_model=AnalysisSummary, status_code=status.HTTP_201_CREATED)
def analyze_my_transactions(
    req: AnalyzeRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalysisSummary:
    """Run the forensic engine over the caller's own transactions and persist
    the result to their history. This is the web-dashboard equivalent of the
    mobile app's on-device SMS scan -- until a linked bank/MoMo account has a
    working automated sync configured, this is how an individual or business
    account gets their own health score."""
    result = forensic_engine.analyze([t.model_dump() for t in req.transactions])

    record = AnalysisResult(
        user_id=current_user.id,
        financial_health_score=result["financial_health_score"],
        health_band=result["health_band"],
        money_leaks=result["money_leaks"],
        summary_plain_language=result["summary_plain_language"],
        transaction_count=len(req.transactions),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return AnalysisSummary(
        id=record.id,
        financial_health_score=record.financial_health_score,
        health_band=record.health_band,
        money_leaks=_visible_leaks(record.money_leaks),
        summary_plain_language=record.summary_plain_language,
        transaction_count=record.transaction_count,
        created_at=record.created_at.isoformat(),
    )


@router.get("/analyses", response_model=List[AnalysisSummary])
def list_my_analyses(
    limit: int = Query(10, ge=1, le=50),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[AnalysisSummary]:
    """The caller's own analysis history, newest first."""
    results = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.user_id == current_user.id)
        .order_by(AnalysisResult.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        AnalysisSummary(
            id=r.id,
            financial_health_score=r.financial_health_score,
            health_band=r.health_band,
            money_leaks=_visible_leaks(r.money_leaks),
            summary_plain_language=r.summary_plain_language,
            transaction_count=r.transaction_count,
            created_at=r.created_at.isoformat(),
        )
        for r in results
    ]


@router.get("/account", response_model=MyAccountSettings)
def get_my_account_settings(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MyAccountSettings:
    settings_row = (
        db.query(AccountSettings).filter(AccountSettings.user_id == current_user.id).first()
    )
    if settings_row is None:
        return MyAccountSettings(account_type="individual", business_name=None)
    return MyAccountSettings(
        account_type=settings_row.account_type, business_name=settings_row.business_name
    )


@router.put("/account", response_model=MyAccountSettings)
def update_my_account_settings(
    req: UpdateAccountSettingsRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MyAccountSettings:
    """No admin approval needed -- this only labels billing/display context
    for the caller's own account, it grants no additional access."""
    settings_row = (
        db.query(AccountSettings).filter(AccountSettings.user_id == current_user.id).first()
    )
    now = datetime.utcnow()
    if settings_row is None:
        settings_row = AccountSettings(
            user_id=current_user.id,
            account_type=req.account_type,
            business_name=req.business_name,
            created_at=now,
            updated_at=now,
        )
        db.add(settings_row)
    else:
        settings_row.account_type = req.account_type
        settings_row.business_name = req.business_name
        settings_row.updated_at = now
    db.commit()

    return MyAccountSettings(
        account_type=settings_row.account_type, business_name=settings_row.business_name
    )


class RedeemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    partner_id: str


class RedeemResponse(BaseModel):
    redemption_id: int
    partner_id: str
    points_spent: int
    remaining_points: int


@router.post("/redeem", response_model=RedeemResponse, status_code=status.HTTP_201_CREATED)
def redeem_partner_offer(
    req: RedeemRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RedeemResponse:
    """Spend the caller's own points on a partner offer.

    Validated server-side (points balance, partner is active) rather than
    trusting the client -- this is the one place in the product where a
    button press turns directly into a commission TracePay owes someone.
    """
    partner = (
        db.query(Partner)
        .filter(Partner.id == req.partner_id, Partner.is_active.is_(True))
        .first()
    )
    if partner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown or inactive partner")

    profile = db.query(Profile).filter(Profile.id == current_user.id).first()
    current_points = profile.reward_points if profile is not None else 0

    if current_points < partner.points_cost:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough points")

    if profile is None:
        # A verified Supabase user with no profiles row yet (shouldn't happen
        # in practice -- the mobile app ensures one on sign-in -- but a 0
        # balance is unreachable here anyway since points_cost is always > 0).
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No profile found")

    profile.reward_points = current_points - partner.points_cost
    commission_amount = round(partner.estimated_value_rand * partner.commission_rate, 2)

    redemption = Redemption(
        user_id=current_user.id,
        partner_id=partner.id,
        points_spent=partner.points_cost,
        commission_amount=commission_amount,
    )
    db.add(redemption)
    db.commit()
    db.refresh(redemption)

    return RedeemResponse(
        redemption_id=redemption.id,
        partner_id=partner.id,
        points_spent=redemption.points_spent,
        remaining_points=profile.reward_points,
    )
