from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..audit import add_audit_event
from ..database import get_db
from ..models_db import FrozenItem, User

router = APIRouter(prefix="/mobile", tags=["mobile"])


class FreezeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    leak_id: str | None = Field(default=None, min_length=1, max_length=255)
    transaction_id: str | None = Field(default=None, min_length=1, max_length=255)
    consent_id: str | None = Field(default=None, min_length=1, max_length=255)
    reason: str = Field(default="User pressed Freeze in mobile app", min_length=1, max_length=1000)

    @model_validator(mode="after")
    def require_freeze_identifier(self) -> "FreezeRequest":
        if not (self.leak_id or self.transaction_id or self.consent_id):
            raise ValueError("Provide at least one of leak_id, transaction_id, consent_id")
        return self


class FreezeResponse(BaseModel):
    status: str
    message: str
    frozen_item_id: int | None = None


class FrozenItemResponse(BaseModel):
    id: int
    leak_id: str | None
    transaction_id: str | None
    consent_id: str | None
    reason: str
    frozen_at: str
    status: str

    class Config:
        from_attributes = True


@router.post("/freeze", response_model=FreezeResponse, status_code=status.HTTP_201_CREATED)
def freeze_leak(
    req: FreezeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FreezeResponse:
    """Freeze a leak (for mobile app)"""
    if not (req.leak_id or req.transaction_id or req.consent_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide at least one of leak_id, transaction_id, consent_id")

    frozen_item = FrozenItem(
        user_id=current_user.id,
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
        target_user=current_user,
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
def list_frozen(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[FrozenItemResponse]:
    """List user's frozen items"""
    frozen_items = (
        db.query(FrozenItem)
        .filter(FrozenItem.user_id == current_user.id, FrozenItem.status == "frozen")
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
def unfreeze(
    request: Request,
    frozen_item_id: int = Path(gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Unfreeze an item"""
    frozen_item = (
        db.query(FrozenItem)
        .filter(FrozenItem.id == frozen_item_id, FrozenItem.user_id == current_user.id)
        .first()
    )
    if not frozen_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frozen item not found")

    frozen_item.status = "unfrozen"
    add_audit_event(
        db,
        "freeze_released",
        actor=current_user,
        target_user=current_user,
        metadata={"frozen_item_id": frozen_item.id},
        request=request,
    )
    db.commit()

    return {"message": "Item unfrozen successfully"}

