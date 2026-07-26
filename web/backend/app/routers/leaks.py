from __future__ import annotations

from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from ..auth_supabase import SupabasePrincipal, get_current_supabase_user
from ..database import get_db
from ..leak_lifecycle import run_leak_lifecycle
from ..models import LeakResponse, TransactionSyncRequest, TransactionSyncResponse
from ..models_db import Leak, Transaction

router = APIRouter(tags=["leaks"])


def _response(leak: Leak) -> LeakResponse:
    return LeakResponse(
        id=str(leak.id),
        fi_code=leak.fi_code,
        status=leak.status,
        detected_at=leak.detected_at,
        resolved_at=leak.resolved_at,
        detection_rule=leak.detection_rule,
        resolution_rule=leak.resolution_rule,
        resolution_checked_at=leak.resolution_checked_at,
        evidence=leak.evidence or {},
        resolution_evidence=leak.resolution_evidence,
        merchant=leak.merchant,
        amount_monthly=float(leak.amount_monthly),
        amount_annual=float(leak.amount_annual),
        exact_action=leak.exact_action,
    )


def _transaction_id(user_id: str, client_id: str) -> str:
    return f"sms:{user_id}:{client_id}"


@router.post(
    "/transactions/sync",
    response_model=TransactionSyncResponse,
    status_code=status.HTTP_200_OK,
)
def sync_transactions(
    request: TransactionSyncRequest,
    principal: SupabasePrincipal = Depends(get_current_supabase_user),
    db: Session = Depends(get_db),
) -> TransactionSyncResponse:
    transaction_ids = [
        _transaction_id(str(principal.id), transaction.client_id)
        for transaction in request.transactions
    ]
    existing_ids = {
        row[0]
        for row in db.query(Transaction.transaction_id)
        .filter(Transaction.transaction_id.in_(transaction_ids))
        .all()
    }
    inserted_count = 0
    for transaction in request.transactions:
        transaction_id = _transaction_id(str(principal.id), transaction.client_id)
        if transaction_id in existing_ids:
            continue
        db.add(
            Transaction(
                user_id=principal.id,
                transaction_id=transaction_id,
                timestamp=transaction.timestamp,
                amount=transaction.amount,
                currency=transaction.currency,
                description=transaction.description,
                merchant=transaction.merchant,
                category=transaction.category,
                counterparty=transaction.counterparty,
                direction=transaction.direction,
                channel=transaction.channel,
                transaction_data={"client_id": transaction.client_id, **transaction.meta},
            )
        )
        inserted_count += 1
    try:
        db.flush()
        leaks = run_leak_lifecycle(db, principal.id)
        db.commit()
    except (IntegrityError, OperationalError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to synchronize transactions right now",
        ) from exc
    return TransactionSyncResponse(
        accepted_count=len(request.transactions),
        inserted_count=inserted_count,
        leaks=[_response(leak) for leak in leaks],
    )


@router.get("/leaks", response_model=list[LeakResponse])
def list_leaks(
    principal: SupabasePrincipal = Depends(get_current_supabase_user),
    db: Session = Depends(get_db),
) -> list[LeakResponse]:
    try:
        leaks: Iterable[Leak] = (
            db.query(Leak)
            .filter(Leak.user_id == principal.id)
            .order_by(Leak.detected_at.desc())
            .all()
        )
    except OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to load leaks right now",
        ) from exc
    return [_response(leak) for leak in leaks]
