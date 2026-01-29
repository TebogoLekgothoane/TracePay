from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models_db import LinkedAccount, User
from ..mtn_momo_client import MTNMoMoClient

router = APIRouter(prefix="/mtn-momo", tags=["mtn momo"])

momo_client = MTNMoMoClient()


class LinkMoMoRequest(BaseModel):
    phone_number: str
    pin: str  # In production, this would be handled securely


class LinkMoMoResponse(BaseModel):
    account_id: str
    phone_number: str
    status: str
    linked_at: str


@router.post("/link", response_model=LinkMoMoResponse, status_code=status.HTTP_201_CREATED)
async def link_momo_account(
    req: LinkMoMoRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LinkMoMoResponse:
    """Link an MTN MoMo account"""
    # Check if already linked
    existing = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.user_id == current_user.id, LinkedAccount.bank_name == "MTN MoMo")
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MTN MoMo account already linked")

    # Link account via MTN API (simulated)
    link_result = await momo_client.link_account(phone_number=req.phone_number, pin=req.pin)

    # Store in database
    account = LinkedAccount(
        user_id=current_user.id,
        bank_name="MTN MoMo",
        account_id=link_result["account_id"],
        status="active",
        metadata={"phone_number": req.phone_number, "linked_at": link_result["linked_at"]},
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    return LinkMoMoResponse(
        account_id=link_result["account_id"],
        phone_number=req.phone_number,
        status=link_result["status"],
        linked_at=link_result["linked_at"],
    )


@router.get("/transactions")
async def get_momo_transactions(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Fetch MTN MoMo transactions"""
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.id == account_id, LinkedAccount.user_id == current_user.id, LinkedAccount.bank_name == "MTN MoMo")
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MTN MoMo account not found")

    transactions = await momo_client.fetch_transactions(account_id=account.account_id)

    return {
        "account_id": account_id,
        "transactions": transactions,
        "count": len(transactions),
    }


@router.post("/sync")
async def sync_momo(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Sync MTN MoMo data"""
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.id == account_id, LinkedAccount.user_id == current_user.id, LinkedAccount.bank_name == "MTN MoMo")
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MTN MoMo account not found")

    # Fetch transactions
    transactions = await momo_client.fetch_transactions(account_id=account.account_id)

    # Calculate inclusion tax
    inclusion_tax = momo_client.calculate_inclusion_tax(transactions)

    # Detect patterns
    patterns = momo_client.detect_momo_patterns(transactions)

    # Update last_synced_at
    account.last_synced_at = datetime.utcnow()
    db.commit()

    return {
        "message": "Sync completed",
        "transactions_count": len(transactions),
        "inclusion_tax": inclusion_tax,
        "patterns": patterns,
        "last_synced_at": account.last_synced_at.isoformat(),
    }

