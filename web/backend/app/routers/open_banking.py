from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..audit import add_audit_event
from ..background_jobs import (
    JOB_OPEN_BANKING_FETCH,
    JobAcceptedResponse,
    enqueue_background_job,
)
from ..database import get_db
from ..models_db import LinkedAccount, User
from ..open_banking_client import OpenBankingSandboxClient, SandboxConfig
from ..settings import settings

router = APIRouter(prefix="/open-banking", tags=["open banking"])


def _open_banking_mode() -> str:
    return "production" if settings.open_banking_mode == "production" else "sandbox"


def _is_sandbox() -> bool:
    return _open_banking_mode() != "production"


def _open_banking_client() -> OpenBankingSandboxClient:
    return OpenBankingSandboxClient(
        SandboxConfig(
            base_url=settings.open_banking_base_url,
            client_id=settings.open_banking_client_id,
            client_secret=settings.open_banking_client_secret,
        )
    )


def _open_banking_not_configured_detail() -> str:
    mode = _open_banking_mode()
    return (
        f"Open Banking {mode} mode is not configured. Set OPEN_BANKING_MODE, "
        "OPEN_BANKING_BASE_URL, OPEN_BANKING_CLIENT_ID, and OPEN_BANKING_CLIENT_SECRET."
    )


def _callback_url(consent_id: str) -> str | None:
    callback_base_url = settings.backend_public_url or settings.app_public_url
    if not callback_base_url:
        return None
    return (
        f"{callback_base_url.rstrip('/')}/v1/open-banking/callback"
        f"?consentId={consent_id}"
    )


def _with_callback_params(auth_url: str, consent_id: str) -> str:
    callback_url = _callback_url(consent_id)
    if not callback_url:
        return auth_url
    parts = urlsplit(auth_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("redirect_uri", callback_url)
    query.setdefault("returnUrl", callback_url)
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


def _sandbox_error_detail(exc: Exception) -> str:
    """Turn sandbox/httpx errors into a clear message for the API response."""
    if isinstance(exc, httpx.HTTPStatusError):
        try:
            body = exc.response.text
            if body:
                return f"Sandbox returned {exc.response.status_code}: {body[:500]}"
        except Exception:
            pass
        return (
            f"Sandbox returned {exc.response.status_code}: {exc.response.reason_phrase}"
        )
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
    model_config = ConfigDict(extra="forbid")

    permissions: list[str] = Field(
        default_factory=lambda: [
            "ReadAccountsBasic",
            "ReadTransactionsBasic",
            "ReadTransactionsCredits",
            "ReadTransactionsDebits",
        ],
        min_length=1,
        max_length=20,
    )
    expiration_days: int = Field(default=90, ge=1, le=365)

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, permissions: list[str]) -> list[str]:
        allowed_permissions = {
            "ReadAccountsBasic",
            "ReadAccountsDetail",
            "ReadBalances",
            "ReadTransactionsBasic",
            "ReadTransactionsCredits",
            "ReadTransactionsDebits",
            "ReadTransactionsDetail",
        }
        invalid_permissions = [
            permission
            for permission in permissions
            if permission not in allowed_permissions
        ]
        if invalid_permissions:
            raise ValueError(
                f"Unsupported permissions: {', '.join(invalid_permissions)}"
            )
        return permissions


class ConsentResponse(BaseModel):
    consent_id: str
    status: str
    authorization_url: str | None = None
    provider_mode: str
    is_sandbox: bool


@router.post("/consent", response_model=ConsentResponse)
async def create_consent(
    req: ConsentRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConsentResponse:
    """Create Open Banking consent for account access"""
    if not (settings.open_banking_client_id and settings.open_banking_client_secret):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_open_banking_not_configured_detail(),
        )
    ob_client = _open_banking_client()
    try:
        token_response = await ob_client.token_client_credentials()
        client_token = token_response.get("access_token")
        if not client_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Open Banking {_open_banking_mode()} provider did not return an access token.",
            )

        expiration = (
            datetime.utcnow() + timedelta(days=req.expiration_days)
        ).isoformat()

        consent_response = await ob_client.create_consent(
            client_token=client_token,
            permissions=req.permissions,
            expirationDateTime=expiration,
        )

        # Providers may return ConsentId under Data or at top level.
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
                detail=f"Open Banking {_open_banking_mode()} provider did not return a consent ID. Response keys: "
                + ", ".join(_safe_keys(consent_response)),
            )

        auth_url = (
            data.get("AuthorisationUrl")
            or data.get("authorisation_url")
            or consent_response.get("AuthorisationUrl")
            or consent_response.get("authorisation_url")
        )
        if not auth_url and consent_id:
            base = ob_client.cfg.base_url
            auth_url = f"{base.rstrip('/')}/psu/authorize/ui?consentId={consent_id}"
        if auth_url:
            auth_url = _with_callback_params(auth_url, consent_id)

        account = LinkedAccount(
            user_id=current_user.id,
            bank_name="Open Banking",
            account_id=f"ob_{consent_id}",
            open_banking_consent_id=consent_id,
            status="pending",
            account_metadata={
                "permissions": req.permissions,
                "expiration": expiration,
                "provider_mode": _open_banking_mode(),
                "is_sandbox": _is_sandbox(),
            },
        )
        db.add(account)
        db.flush()
        add_audit_event(
            db,
            "consent_changed",
            actor=current_user,
            target_user=current_user,
            metadata={
                "action": "open_banking_consent_created",
                "linked_account_id": account.id,
                "consent_id": consent_id,
                "permissions": req.permissions,
                "provider_mode": _open_banking_mode(),
            },
            request=request,
        )
        db.commit()

        return ConsentResponse(
            consent_id=consent_id,
            status="pending",
            authorization_url=auth_url,
            provider_mode=_open_banking_mode(),
            is_sandbox=_is_sandbox(),
        )
    except HTTPException:
        raise
    except Exception as e:
        detail = _sandbox_error_detail(e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to create consent: {detail}",
        )


@router.get("/callback")
async def consent_callback(
    consent_id: str = Query(alias="consentId", min_length=1, max_length=255),
    status_value: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Handle the consent return URL and mark the linked account as authorised when applicable."""
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.open_banking_consent_id == consent_id)
        .first()
    )
    outcome = "received"
    if account:
        normalized_status = (status_value or "").lower()
        if normalized_status in {"authorised", "authorized", "active", "accepted"}:
            account.status = "active"
            outcome = "authorised"
        elif normalized_status in {"rejected", "revoked", "failed", "denied"}:
            account.status = "failed"
            outcome = normalized_status
        else:
            account.status = "pending"
        metadata = dict(account.account_metadata or {})
        metadata["last_callback_status"] = status_value or "not_provided"
        metadata["last_callback_at"] = datetime.utcnow().isoformat()
        account.account_metadata = metadata
        db.commit()

    app_url = settings.app_public_url.rstrip("/") if settings.app_public_url else ""
    redirect_url = (
        f"{app_url}/accounts?open_banking_consent={consent_id}&status={outcome}"
        if app_url
        else f"/accounts?open_banking_consent={consent_id}&status={outcome}"
    )
    return RedirectResponse(redirect_url)


@router.get("/consent/{consent_id}")
async def get_consent(
    consent_id: str = Path(min_length=1, max_length=255),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Check consent status"""
    # Verify consent belongs to user
    account = (
        db.query(LinkedAccount)
        .filter(
            LinkedAccount.open_banking_consent_id == consent_id,
            LinkedAccount.user_id == current_user.id,
        )
        .first()
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consent not found"
        )

    try:
        ob_client = _open_banking_client()
        token_response = await ob_client.token_client_credentials()
        client_token = token_response.get("access_token")
        consent_data = await ob_client.get_consent(
            client_token=client_token, consent_id=consent_id
        )
        return {
            "provider_mode": _open_banking_mode(),
            "is_sandbox": _is_sandbox(),
            "local_status": account.status,
            "provider": consent_data,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get consent: {str(e)}",
        )


@router.post(
    "/fetch-transactions",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def fetch_transactions(
    request: Request,
    account_id: int = Query(gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobAcceptedResponse:
    """Queue Open Banking transaction sync and forensic analysis."""
    account = (
        db.query(LinkedAccount)
        .filter(
            LinkedAccount.id == account_id, LinkedAccount.user_id == current_user.id
        )
        .first()
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    if not account.open_banking_consent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account not linked via Open Banking",
        )

    job = enqueue_background_job(
        db,
        JOB_OPEN_BANKING_FETCH,
        current_user.id,
        {"account_id": account_id},
    )
    add_audit_event(
        db,
        "consent_changed",
        actor=current_user,
        target_user=current_user,
        metadata={
            "action": "open_banking_sync_queued",
            "linked_account_id": account.id,
            "job_id": job.job_id,
        },
        request=request,
    )
    db.commit()
    return JobAcceptedResponse(
        job_id=job.job_id,
        status=job.status,
        message=f"Open Banking {_open_banking_mode()} sync queued. Poll /v1/jobs/{job_id} for status.",
    )


@router.get("/accounts")
async def list_open_banking_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """List accounts from Open Banking"""
    accounts = (
        db.query(LinkedAccount)
        .filter(
            LinkedAccount.user_id == current_user.id,
            LinkedAccount.open_banking_consent_id.isnot(None),
        )
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
                "provider_mode": (acc.account_metadata or {}).get("provider_mode", _open_banking_mode()),
                "is_sandbox": bool((acc.account_metadata or {}).get("is_sandbox", _is_sandbox())),
            }
            for acc in accounts
        ]
    }
