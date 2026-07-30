from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, get_current_user
from ..audit import add_audit_event
from ..business_scope import require_business_owner, resolve_business_user_id
from ..database import get_db
from ..forensic_engine import ForensicEngine
from ..models import AnalyzeRequest
from ..models_db import AnalysisResult, BusinessMembership, FrozenItem, LinkedAccount
from ..supabase_admin import SupabaseAdminError, invite_user_by_email

router = APIRouter(prefix="/me/business", tags=["business"])
forensic_engine = ForensicEngine()

# Mirrors app/routers/me.py's own constant -- kept in sync manually since
# the two routers serve different scopes (caller's own data vs. the
# business they act on behalf of) and shouldn't import each other's
# private helpers.
_METADATA_ONLY_DETECTORS = {"InclusionScorer", "StakeholderMetrics", "DataSource"}


def _visible_leaks(money_leaks: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    return [leak for leak in (money_leaks or []) if leak.get("detector") not in _METADATA_ONLY_DETECTORS]


class BusinessSummary(BaseModel):
    financial_health_score: Optional[int]
    health_band: Optional[str]
    leaks_found: int
    potential_monthly_savings: float
    linked_accounts_count: int
    frozen_items_count: int
    last_analyzed_at: Optional[str]


class BusinessAnalysisSummary(BaseModel):
    id: int
    financial_health_score: int
    health_band: str
    money_leaks: List[Dict[str, Any]]
    summary_plain_language: str
    transaction_count: int
    created_at: str


@router.get("/summary", response_model=BusinessSummary)
def get_business_summary(
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> BusinessSummary:
    """The business's financial health snapshot -- same shape as /me/summary,
    but scoped to the business owner's data for both the owner and any of
    their invited members."""
    latest = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.user_id == business_user_id)
        .order_by(AnalysisResult.created_at.desc())
        .first()
    )
    linked_accounts_count = db.query(LinkedAccount).filter(LinkedAccount.user_id == business_user_id).count()
    frozen_items_count = db.query(FrozenItem).filter(FrozenItem.user_id == business_user_id).count()

    if latest is None:
        return BusinessSummary(
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

    return BusinessSummary(
        financial_health_score=latest.financial_health_score,
        health_band=latest.health_band,
        leaks_found=len(leaks),
        potential_monthly_savings=round(savings, 2),
        linked_accounts_count=linked_accounts_count,
        frozen_items_count=frozen_items_count,
        last_analyzed_at=latest.created_at.isoformat(),
    )


@router.post("/analyze", response_model=BusinessAnalysisSummary, status_code=status.HTTP_201_CREATED)
def analyze_business_transactions(
    req: AnalyzeRequest,
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> BusinessAnalysisSummary:
    """Run the forensic engine over the business's transactions and persist
    the result under the business owner -- so it shows up for every member,
    not just whoever happened to run it."""
    result = forensic_engine.analyze([t.model_dump() for t in req.transactions])

    record = AnalysisResult(
        user_id=business_user_id,
        financial_health_score=result["financial_health_score"],
        health_band=result["health_band"],
        money_leaks=result["money_leaks"],
        summary_plain_language=result["summary_plain_language"],
        transaction_count=len(req.transactions),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return BusinessAnalysisSummary(
        id=record.id,
        financial_health_score=record.financial_health_score,
        health_band=record.health_band,
        money_leaks=_visible_leaks(record.money_leaks),
        summary_plain_language=record.summary_plain_language,
        transaction_count=record.transaction_count,
        created_at=record.created_at.isoformat(),
    )


@router.get("/analyses", response_model=List[BusinessAnalysisSummary])
def list_business_analyses(
    limit: int = Query(10, ge=1, le=50),
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> List[BusinessAnalysisSummary]:
    """The business's analysis history, newest first."""
    results = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.user_id == business_user_id)
        .order_by(AnalysisResult.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        BusinessAnalysisSummary(
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


class AccountResponse(BaseModel):
    id: int
    bank_name: str
    account_id: str
    status: str
    last_synced_at: Optional[str]
    created_at: str
    metadata: Dict[str, Any]
    branch_label: Optional[str]


def _account_response(account: LinkedAccount) -> AccountResponse:
    return AccountResponse(
        id=account.id,
        bank_name=account.bank_name,
        account_id=account.account_id,
        status=account.status,
        last_synced_at=account.last_synced_at.isoformat() if account.last_synced_at else None,
        created_at=account.created_at.isoformat(),
        metadata=account.account_metadata or {},
        branch_label=account.branch_label,
    )


class LinkAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bank_name: str = Field(min_length=1, max_length=100)
    account_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    open_banking_consent_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    branch_label: Optional[str] = Field(default=None, max_length=100)


class UpdateAccountBranchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    branch_label: Optional[str] = Field(default=None, max_length=100)


@router.get("/accounts", response_model=List[AccountResponse])
def list_business_accounts(
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> List[AccountResponse]:
    accounts = db.query(LinkedAccount).filter(LinkedAccount.user_id == business_user_id).all()
    return [_account_response(account) for account in accounts]


@router.post("/accounts/link", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def link_business_account(
    req: LinkAccountRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> AccountResponse:
    """A member linking an account attributes it to the business, not to
    themselves -- so it shows up for the owner and every other member too."""
    existing = (
        db.query(LinkedAccount)
        .filter(
            LinkedAccount.user_id == business_user_id,
            LinkedAccount.account_id == req.account_id,
            LinkedAccount.bank_name == req.bank_name,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account already linked")

    account = LinkedAccount(
        user_id=business_user_id,
        bank_name=req.bank_name,
        account_id=req.account_id or f"{req.bank_name}_{business_user_id}_{datetime.utcnow().timestamp()}",
        open_banking_consent_id=req.open_banking_consent_id,
        status="active",
        account_metadata=req.metadata,
        branch_label=req.branch_label,
    )
    db.add(account)
    db.flush()
    add_audit_event(
        db,
        "consent_changed",
        actor=current_user,
        target_user=business_user_id,
        metadata={
            "action": "account_linked",
            "linked_account_id": account.id,
            "bank_name": account.bank_name,
            "has_open_banking_consent": bool(account.open_banking_consent_id),
        },
        request=request,
    )
    db.commit()
    db.refresh(account)
    return _account_response(account)


@router.put("/accounts/{account_id}/branch", response_model=AccountResponse)
def update_business_account_branch(
    req: UpdateAccountBranchRequest,
    account_id: int = Path(gt=0),
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> AccountResponse:
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.id == account_id, LinkedAccount.user_id == business_user_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    account.branch_label = req.branch_label
    db.commit()
    db.refresh(account)
    return _account_response(account)


@router.delete("/accounts/{account_id}")
def unlink_business_account(
    request: Request,
    account_id: int = Path(gt=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.id == account_id, LinkedAccount.user_id == business_user_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    add_audit_event(
        db,
        "consent_changed",
        actor=current_user,
        target_user=business_user_id,
        metadata={
            "action": "account_unlinked",
            "linked_account_id": account.id,
            "bank_name": account.bank_name,
            "had_open_banking_consent": bool(account.open_banking_consent_id),
        },
        request=request,
    )
    db.delete(account)
    db.commit()
    return {"message": "Account unlinked successfully"}


@router.post("/accounts/{account_id}/sync")
def sync_business_account(
    account_id: int = Path(gt=0),
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.id == account_id, LinkedAccount.user_id == business_user_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    account.last_synced_at = datetime.utcnow()
    db.commit()
    return {"message": "Sync initiated", "last_synced_at": account.last_synced_at.isoformat()}


class FreezeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    leak_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    transaction_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    consent_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    reason: str = Field(default="Freeze requested from business dashboard", min_length=1, max_length=1000)


class FreezeResponse(BaseModel):
    status: str
    message: str
    frozen_item_id: Optional[int] = None


class FrozenItemResponse(BaseModel):
    id: int
    leak_id: Optional[str]
    transaction_id: Optional[str]
    consent_id: Optional[str]
    reason: str
    frozen_at: str
    status: str


@router.post("/freeze", response_model=FreezeResponse, status_code=status.HTTP_201_CREATED)
def freeze_business_leak(
    req: FreezeRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> FreezeResponse:
    if not (req.leak_id or req.transaction_id or req.consent_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one of leak_id, transaction_id, consent_id",
        )

    frozen_item = FrozenItem(
        user_id=business_user_id,
        leak_id=req.leak_id,
        transaction_id=req.transaction_id,
        consent_id=req.consent_id,
        reason=req.reason,
        status="frozen",
    )
    db.add(frozen_item)
    db.flush()
    add_audit_event(
        db,
        "freeze_created",
        actor=current_user,
        target_user=business_user_id,
        metadata={
            "frozen_item_id": frozen_item.id,
            "leak_id": req.leak_id,
            "transaction_id": req.transaction_id,
            "consent_id": req.consent_id,
        },
        request=request,
    )
    db.commit()
    db.refresh(frozen_item)

    return FreezeResponse(
        status="ok",
        message="Leak frozen successfully. This simulates revoking consent or blocking the transaction.",
        frozen_item_id=frozen_item.id,
    )


@router.get("/frozen", response_model=List[FrozenItemResponse])
def list_business_frozen(
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> List[FrozenItemResponse]:
    frozen_items = (
        db.query(FrozenItem)
        .filter(FrozenItem.user_id == business_user_id, FrozenItem.status == "frozen")
        .order_by(FrozenItem.frozen_at.desc())
        .all()
    )
    return [
        FrozenItemResponse(
            id=item.id,
            leak_id=item.leak_id,
            transaction_id=item.transaction_id,
            consent_id=item.consent_id,
            reason=item.reason,
            frozen_at=item.frozen_at.isoformat(),
            status=item.status,
        )
        for item in frozen_items
    ]


@router.post("/unfreeze/{frozen_item_id}")
def unfreeze_business_item(
    request: Request,
    frozen_item_id: int = Path(gt=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    business_user_id: uuid.UUID = Depends(resolve_business_user_id),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    frozen_item = (
        db.query(FrozenItem)
        .filter(FrozenItem.id == frozen_item_id, FrozenItem.user_id == business_user_id)
        .first()
    )
    if not frozen_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frozen item not found")

    frozen_item.status = "unfrozen"
    add_audit_event(
        db,
        "freeze_released",
        actor=current_user,
        target_user=business_user_id,
        metadata={"frozen_item_id": frozen_item.id},
        request=request,
    )
    db.commit()
    return {"message": "Item unfrozen successfully"}


class InviteMemberRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class MemberResponse(BaseModel):
    id: int
    member_user_id: str
    invited_email: str
    created_at: str


@router.post("/invite-member", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_business_member(
    req: InviteMemberRequest,
    current_user: AuthenticatedUser = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> MemberResponse:
    """Invite a staff member to view this business's dashboard -- owner only.
    Reuses the same Supabase invite-by-email flow as admin provisioning; the
    invitee gets a magic-link email to set their own password."""
    email = req.email.strip().lower()
    try:
        invited = await invite_user_by_email(email, "user")
    except SupabaseAdminError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    member_user_id = invited.get("id")
    if not member_user_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase did not return a user id for the invite.",
        )

    existing = (
        db.query(BusinessMembership)
        .filter(BusinessMembership.member_user_id == uuid.UUID(member_user_id))
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That person already belongs to a business.",
        )

    membership = BusinessMembership(
        owner_user_id=current_user.id,
        member_user_id=uuid.UUID(member_user_id),
        invited_email=email,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)

    return MemberResponse(
        id=membership.id,
        member_user_id=str(membership.member_user_id),
        invited_email=membership.invited_email,
        created_at=membership.created_at.isoformat(),
    )


@router.get("/members", response_model=List[MemberResponse])
def list_business_members(
    current_user: AuthenticatedUser = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> List[MemberResponse]:
    members = (
        db.query(BusinessMembership)
        .filter(BusinessMembership.owner_user_id == current_user.id)
        .order_by(BusinessMembership.created_at.desc())
        .all()
    )
    return [
        MemberResponse(
            id=member.id,
            member_user_id=str(member.member_user_id),
            invited_email=member.invited_email,
            created_at=member.created_at.isoformat(),
        )
        for member in members
    ]


@router.delete("/members/{member_id}")
def remove_business_member(
    request: Request,
    member_id: int = Path(gt=0),
    current_user: AuthenticatedUser = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    member = (
        db.query(BusinessMembership)
        .filter(BusinessMembership.id == member_id, BusinessMembership.owner_user_id == current_user.id)
        .first()
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    add_audit_event(
        db,
        "business_member_removed",
        actor=current_user,
        target_user=member.member_user_id,
        metadata={"invited_email": member.invited_email},
        request=request,
    )
    db.delete(member)
    db.commit()
    return {"message": "Member removed"}
