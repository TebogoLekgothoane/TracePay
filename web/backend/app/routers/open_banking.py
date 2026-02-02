from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any, Dict

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..forensic_engine import ForensicEngine
from ..models_db import AnalysisResult, LinkedAccount, Transaction, User
from ..open_banking_client import OpenBankingSandboxClient, SandboxConfig

load_dotenv()

router = APIRouter(prefix="/open-banking", tags=["open banking"])

client_id = os.getenv("OPEN_BANKING_CLIENT_ID", "")
client_secret = os.getenv("OPEN_BANKING_CLIENT_SECRET", "")

sandbox_config = SandboxConfig(
    client_id=client_id,
    client_secret=client_secret,
)
ob_client = OpenBankingSandboxClient(sandbox_config)
forensic_engine = ForensicEngine()


def _sandbox_error_detail(exc: Exception) -> str:
    """Turn sandbox/httpx errors into a clear message for the API response."""
    if isinstance(exc, httpx.HTTPStatusError):
        try:
            body = exc.response.text
            if body:
                return f"Sandbox returned {exc.response.status_code}: {body[:500]}"
        except Exception:
            pass
        return f"Sandbox returned {exc.response.status_code}: {exc.response.reason_phrase}"
    return str(exc)


def _safe_keys(obj: Any) -> list:
    """Return keys of a dict for error messages; avoid breaking on non-dict."""
    if isinstance(obj, dict):
        return list(obj.keys())
    return []


def _extract_account_ids(accounts_response: Dict[str, Any]) -> list[str]:
    """Extract bank account IDs (e.g. acc-001) from sandbox GET /accounts response."""
    ids: list[str] = []
    data = accounts_response.get("Data") or accounts_response
    accounts = data.get("Account") if isinstance(data, dict) else None
    if not accounts and isinstance(data, dict) and "Account" not in data:
        accounts = data.get("accounts") or (data if isinstance(data, list) else None)
    if not accounts:
        return ids
    for acc in accounts if isinstance(accounts, list) else [accounts]:
        if not isinstance(acc, dict):
            continue
        aid = acc.get("AccountId") or acc.get("account_id") or acc.get("identification")
        if aid and isinstance(aid, str):
            ids.append(aid)
    return ids


class ConsentRequest(BaseModel):
    permissions: list[str] = [
        "ReadAccountsBasic",
        "ReadTransactionsBasic",
        "ReadTransactionsCredits",
        "ReadTransactionsDebits",
    ]
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
    if not (client_id and client_secret):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Open Banking sandbox not configured. Add OPEN_BANKING_CLIENT_ID and OPEN_BANKING_CLIENT_SECRET to backend .env (see OPEN_BANKING.md).",
        )
    try:
        token_response = await ob_client.token_client_credentials()
        client_token = token_response.get("access_token")
        if not client_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Sandbox did not return an access token.",
            )

        expiration = (datetime.utcnow() + timedelta(days=req.expiration_days)).isoformat()

        consent_response = await ob_client.create_consent(
            client_token=client_token,
            permissions=req.permissions,
            expirationDateTime=expiration,
        )

        # Sandbox may return ConsentId under Data or at top level
        data = consent_response.get("Data") or {}
        consent_id = (
            data.get("ConsentId")
            or consent_response.get("ConsentId")
            or data.get("consent_id")
            or consent_response.get("consent_id")
            or ""
        )
        if not consent_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Sandbox did not return a consent ID. Response keys: "
                + ", ".join(_safe_keys(consent_response)),
            )

        auth_url = (
            data.get("AuthorisationUrl")
            or data.get("authorisation_url")
            or consent_response.get("AuthorisationUrl")
            or consent_response.get("authorisation_url")
        )
        if not auth_url and consent_id:
            base = getattr(ob_client.cfg, "base_url", "https://open-banking-ais.onrender.com")
            auth_url = f"{base.rstrip('/')}/psu/authorize/ui?consentId={consent_id}"

        account = LinkedAccount(
            user_id=current_user.id,
            bank_name="Open Banking",
            account_id=f"ob_{consent_id}",
            open_banking_consent_id=consent_id,
            status="pending",
            account_metadata={"permissions": req.permissions, "expiration": expiration},
        )
        db.add(account)
        db.commit()

        return ConsentResponse(
            consent_id=consent_id,
            status="pending",
            authorization_url=auth_url,
        )
    except HTTPException:
        raise
    except Exception as e:
        detail = _sandbox_error_detail(e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to create consent: {detail}",
        )


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
    """Fetch transactions from Open Banking API and run forensics"""
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
        # 1. Get data access token (scope needed for /accounts and /accounts/.../transactions)
        token_response = await ob_client.token_client_credentials(
            consent_id=account.open_banking_consent_id,
            scope="accounts.read transactions.read",
        )
        access_token = token_response.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Sandbox did not return a data access token. Ensure consent is Authorised.",
            )

        # 2. List authorised accounts for this consent (acc-001, acc-002, etc.)
        accounts_response = await ob_client.list_accounts(access_token=access_token)
        bank_account_ids = _extract_account_ids(accounts_response)
        if not bank_account_ids:
            return {
                "status": "success",
                "message": "No authorised accounts for this consent. Approve the consent and select accounts, then sync again.",
                "account_id": account_id,
                "new_transactions": 0,
                "total_monitored": 0,
                "health_score": None,
            }

        # 3. Fetch transactions from each authorised account
        raw_txs: list = []
        for bank_account_id in bank_account_ids:
            try:
                tx_response = await ob_client.list_transactions(
                    access_token=access_token, account_id=bank_account_id
                )
                raw_txs.extend(tx_response.get("Data", {}).get("Transaction", []))
            except Exception:
                continue
        
        # 3. Map and save transactions to DB
        new_tx_count = 0
        tx_dicts_for_analysis = []
        
        for rt in raw_txs:
            ext_id = rt.get("TransactionId")
            if not ext_id: continue
            
            # Deduplicate
            existing = db.query(Transaction).filter(Transaction.transaction_id == ext_id).first()
            if not existing:
                amount_data = rt.get("Amount", {})
                
                # Create DB model
                tx = Transaction(
                    user_id=current_user.id,
                    account_id=account.id,
                    transaction_id=ext_id,
                    timestamp=datetime.fromisoformat(rt.get("BookingDateTime").replace("Z", "+00:00")),
                    amount=float(amount_data.get("Amount", 0)),
                    currency=amount_data.get("Currency", "ZAR"),
                    description=rt.get("ProprietaryBankTransactionCode", {}).get("Description", "Bank Transaction"),
                    merchant=rt.get("MerchantDetails", {}).get("MerchantName"),
                    transaction_data=rt,
                    direction="debit" if float(amount_data.get("Amount", 0)) < 0 else "credit"
                )
                db.add(tx)
                new_tx_count += 1
            
            # Add to list for forensic analysis
            tx_dicts_for_analysis.append({
                "id": ext_id,
                "timestamp": rt.get("BookingDateTime"),
                "amount": float(rt.get("Amount", {}).get("Amount", 0)),
                "description": rt.get("ProprietaryBankTransactionCode", {}).get("Description", ""),
                "merchant": rt.get("MerchantDetails", {}).get("MerchantName", ""),
                "direction": "debit" if float(rt.get("Amount", {}).get("Amount", 0)) < 0 else "credit"
            })

        db.commit()
        
        # 4. Run Forensic Analysis
        if tx_dicts_for_analysis:
            analysis = forensic_engine.analyze(tx_dicts_for_analysis)
            
            # Save Analysis Result
            result = AnalysisResult(
                user_id=current_user.id,
                financial_health_score=analysis["financial_health_score"],
                health_band=analysis["health_band"],
                money_leaks=analysis["money_leaks"],
                summary_plain_language=analysis["summary_plain_language"],
                transaction_count=len(tx_dicts_for_analysis)
            )
            db.add(result)
            db.commit()

        # Update last synced
        account.last_synced_at = datetime.utcnow()
        account.status = "active"
        db.commit()

        return {
            "status": "success",
            "message": f"Successfully ingested {new_tx_count} new transactions and updated forensics.",
            "account_id": account_id,
            "new_transactions": new_tx_count,
            "total_monitored": len(tx_dicts_for_analysis),
            "health_score": analysis["financial_health_score"] if tx_dicts_for_analysis else None
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        detail = _sandbox_error_detail(e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch transactions: {detail}",
        )


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

