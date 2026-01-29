from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models_db import LinkedAccount, User
from ..open_banking_client import OpenBankingSandboxClient, SandboxConfig

router = APIRouter(prefix="/accounts", tags=["accounts"])


class LinkAccountRequest(BaseModel):
    bank_name: str
    account_id: Optional[str] = None
    open_banking_consent_id: Optional[str] = None
    metadata: Dict[str, Any] = {}


class AccountResponse(BaseModel):
    id: int
    bank_name: str
    account_id: str
    status: str
    last_synced_at: Optional[str]
    created_at: str
    metadata: Dict[str, Any]

    class Config:
        from_attributes = True


@router.post("/link", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def link_account(req: LinkAccountRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AccountResponse:
    """Link a new bank account"""
    # Check if account already linked
    existing = db.query(LinkedAccount).filter(
        LinkedAccount.user_id == current_user.id,
        LinkedAccount.account_id == req.account_id,
        LinkedAccount.bank_name == req.bank_name,
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account already linked")

    account = LinkedAccount(
        user_id=current_user.id,
        bank_name=req.bank_name,
        account_id=req.account_id or f"{req.bank_name}_{current_user.id}_{datetime.utcnow().timestamp()}",
        open_banking_consent_id=req.open_banking_consent_id,
        status="active",
        metadata=req.metadata,
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    return AccountResponse(
        id=account.id,
        bank_name=account.bank_name,
        account_id=account.account_id,
        status=account.status,
        last_synced_at=account.last_synced_at.isoformat() if account.last_synced_at else None,
        created_at=account.created_at.isoformat(),
        metadata=account.metadata or {},
    )


@router.get("", response_model=List[AccountResponse])
def list_accounts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> List[AccountResponse]:
    """List user's linked accounts"""
    accounts = db.query(LinkedAccount).filter(LinkedAccount.user_id == current_user.id).all()
    return [
        AccountResponse(
            id=acc.id,
            bank_name=acc.bank_name,
            account_id=acc.account_id,
            status=acc.status,
            last_synced_at=acc.last_synced_at.isoformat() if acc.last_synced_at else None,
            created_at=acc.created_at.isoformat(),
            metadata=acc.metadata or {},
        )
        for acc in accounts
    ]


@router.delete("/{account_id}")
def unlink_account(account_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    """Unlink an account"""
    account = db.query(LinkedAccount).filter(LinkedAccount.id == account_id, LinkedAccount.user_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    db.delete(account)
    db.commit()
    return {"message": "Account unlinked successfully"}


@router.post("/{account_id}/sync")
def sync_account(account_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    """Manually sync transactions for an account"""
    account = db.query(LinkedAccount).filter(LinkedAccount.id == account_id, LinkedAccount.user_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # Update last_synced_at
    account.last_synced_at = datetime.utcnow()
    db.commit()

    return {"message": "Sync initiated", "last_synced_at": account.last_synced_at.isoformat()}


def detect_bank_from_account(account_data: Dict[str, Any]) -> str:
    """Detect bank name from account metadata"""
    account_name = account_data.get("account_name", "").lower()
    account_number = account_data.get("account_number", "")

    # Simple heuristics
    if "standard" in account_name or "std" in account_name:
        return "Standard Bank"
    if "fnb" in account_name or "first national" in account_name:
        return "FNB"
    if "absa" in account_name:
        return "Absa"
    if "nedbank" in account_name:
        return "Nedbank"
    if "capitec" in account_name:
        return "Capitec"
    if "mtn" in account_name or "momo" in account_name:
        return "MTN MoMo"
    if "vodacom" in account_name:
        return "Vodacom"

    return "Unknown Bank"

