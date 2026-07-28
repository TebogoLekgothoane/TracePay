from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, get_current_partner_user, get_current_user
from ..database import get_db
from ..models_db import Partner, Redemption

router = APIRouter(tags=["partners"])


class PartnerOffer(BaseModel):
    id: str
    name: str
    offer_description: str
    points_cost: int


@router.get("/partners", response_model=List[PartnerOffer])
def list_partner_offers(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[PartnerOffer]:
    """Active partner offers any signed-in account can redeem points for."""
    partners = db.query(Partner).filter(Partner.is_active.is_(True)).order_by(Partner.name).all()
    return [
        PartnerOffer(
            id=p.id,
            name=p.name,
            offer_description=p.offer_description,
            points_cost=p.points_cost,
        )
        for p in partners
    ]


def _find_own_partner(db: Session, current_user: AuthenticatedUser) -> Optional[Partner]:
    return db.query(Partner).filter(Partner.owner_user_id == current_user.id).first()


class PartnerSummary(BaseModel):
    partner_id: str
    partner_name: str
    total_redemptions: int
    total_points_redeemed: int
    total_commission_owed: float


@router.get("/partner/summary", response_model=PartnerSummary)
def get_partner_summary(
    current_user: AuthenticatedUser = Depends(get_current_partner_user),
    db: Session = Depends(get_db),
) -> PartnerSummary:
    """The signed-in partner's own redemption and commission totals -- never
    another partner's, and never a user's identity."""
    partner = _find_own_partner(db, current_user)
    if partner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No partner account is linked to this login.",
        )

    total_redemptions = (
        db.query(func.count(Redemption.id)).filter(Redemption.partner_id == partner.id).scalar() or 0
    )
    total_points = (
        db.query(func.coalesce(func.sum(Redemption.points_spent), 0))
        .filter(Redemption.partner_id == partner.id)
        .scalar()
        or 0
    )
    total_commission = (
        db.query(func.coalesce(func.sum(Redemption.commission_amount), 0.0))
        .filter(Redemption.partner_id == partner.id)
        .scalar()
        or 0.0
    )

    return PartnerSummary(
        partner_id=partner.id,
        partner_name=partner.name,
        total_redemptions=int(total_redemptions),
        total_points_redeemed=int(total_points),
        total_commission_owed=round(float(total_commission), 2),
    )


class PartnerRedemption(BaseModel):
    id: int
    points_spent: int
    commission_amount: float
    status: str
    redeemed_at: str


@router.get("/partner/redemptions", response_model=List[PartnerRedemption])
def list_partner_redemptions(
    current_user: AuthenticatedUser = Depends(get_current_partner_user),
    db: Session = Depends(get_db),
) -> List[PartnerRedemption]:
    """The signed-in partner's own redemptions, newest first -- no user
    identity is ever included, only the transaction facts."""
    partner = _find_own_partner(db, current_user)
    if partner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No partner account is linked to this login.",
        )

    redemptions = (
        db.query(Redemption)
        .filter(Redemption.partner_id == partner.id)
        .order_by(Redemption.redeemed_at.desc())
        .limit(100)
        .all()
    )
    return [
        PartnerRedemption(
            id=r.id,
            points_spent=r.points_spent,
            commission_amount=r.commission_amount,
            status=r.status,
            redeemed_at=r.redeemed_at.isoformat(),
        )
        for r in redemptions
    ]
