from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models_db import LinkedAccount, Transaction, User
from ..open_banking_client import OpenBankingSandboxClient, SandboxConfig

router = APIRouter(prefix="/open-banking", tags=["open banking"])

# Initialize Open Banking client
import os

sandbox_config = SandboxConfig(
  client_id=os.getenv("OPEN_BANKING_CLIENT_ID", ""),
  client_secret=os.getenv("OPEN_BANKING_CLIENT_SECRET", ""),
)
ob_client = OpenBankingSandboxClient(sandbox_config)


class ConsentRequest(BaseModel):
    permissions: list[str] = ["ReadAccountsBasic", "ReadTransactionsBasic"]
    expiration_days: int = 90


class ConsentResponse(BaseModel):
    consent_id: str
    status: str
    authorization_url: str | None = None


@router.post("/consent", response_model=ConsentResponse)
async def create_consent(
    req: ConsentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConsentResponse:
    """Create Open Banking consent for account access"""
    try:
        # Get client credentials token
        token_response = await ob_client.token_client_credentials()
        client_token = token_response.get("access_token")

        # Calculate expiration
        expiration = (datetime.utcnow() + timedelta(days=req.expiration_days)).isoformat()

        # Create consent
        consent_response = await ob_client.create_consent(
            client_token=client_token,
            permissions=req.permissions,
            expirationDateTime=expiration,
        )

        consent_id = consent_response.get("Data", {}).get("ConsentId", "")

        # Store consent in linked account
        account = LinkedAccount(
            user_id=current_user.id,
            bank_name="Open Banking",
            account_id=f"ob_{consent_id}",
            open_banking_consent_id=consent_id,
            status="pending",
            metadata={"permissions": req.permissions, "expiration": expiration},
        )
        db.add(account)
        db.commit()

        return ConsentResponse(
            consent_id=consent_id,
            status="pending",
            authorization_url=consent_response.get("Data", {}).get("AuthorisationUrl"),
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create consent: {str(e)}")


@router.get("/consent/{consent_id}")
async def get_consent(
    consent_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Check consent status"""
    # Verify consent belongs to user
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.open_banking_consent_id == consent_id, LinkedAccount.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consent not found")

    try:
        token_response = await ob_client.token_client_credentials()
        client_token = token_response.get("access_token")
        consent_data = await ob_client.get_consent(client_token=client_token, consent_id=consent_id)
        return consent_data
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to get consent: {str(e)}")


@router.post("/fetch-transactions")
async def fetch_transactions(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Fetch transactions from Open Banking API"""
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.id == account_id, LinkedAccount.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    if not account.open_banking_consent_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not linked via Open Banking")

    try:
        # Get access token
        token_response = await ob_client.token_client_credentials(consent_id=account.open_banking_consent_id)
        access_token = token_response.get("access_token")

        # List accounts
        accounts_response = await ob_client.list_accounts(access_token=access_token)

        # In production, you'd fetch transactions here
        # For now, return mock response
        return {
            "message": "Transactions fetched (simulated)",
            "account_id": account_id,
            "transactions_count": 0,
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to fetch transactions: {str(e)}")


@router.get("/accounts")
async def list_open_banking_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """List accounts from Open Banking"""
    accounts = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.user_id == current_user.id, LinkedAccount.open_banking_consent_id.isnot(None))
        .all()
    )

    return {
        "accounts": [
            {
                "id": acc.id,
                "bank_name": acc.bank_name,
                "account_id": acc.account_id,
                "status": acc.status,
                "consent_id": acc.open_banking_consent_id,
            }
            for acc in accounts
        ]
    }

