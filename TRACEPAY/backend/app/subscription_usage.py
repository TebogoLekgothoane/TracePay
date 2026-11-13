"""Authenticated, append-only usage answers for subscription findings."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic import BaseModel

from app.finding_registry import _filter_url, _project_url, _request_json

UsageAnswer = Literal["frequently", "sometimes", "rarely", "never", "not_sure"]
_COLUMNS = "id,user_id,finding_id,usage_answer,confirmed_at"


class SubscriptionUsageRequest(BaseModel):
    usage_answer: UsageAnswer


class SubscriptionUsageConfirmation(BaseModel):
    id: str
    user_id: str
    finding_id: str
    usage_answer: UsageAnswer
    confirmed_at: datetime


def load_subscription_usage(
    user_id: str, access_token: str, finding_fingerprint: str
) -> SubscriptionUsageConfirmation | None:
    finding_id = _resolve_subscription_finding(user_id, access_token, finding_fingerprint)
    rows = _request_json(
        _filter_url(
            "subscription_usage_confirmations",
            _COLUMNS,
            user_id,
            f"&finding_id=eq.{quote(finding_id, safe='')}&order=confirmed_at.desc&limit=1",
        ),
        access_token,
        method="GET",
    )
    return _parse(rows[0], user_id, finding_id) if rows else None


def save_subscription_usage(
    user_id: str,
    access_token: str,
    finding_fingerprint: str,
    request: SubscriptionUsageRequest,
    *,
    confirmed_at: datetime,
) -> SubscriptionUsageConfirmation:
    finding_id = _resolve_subscription_finding(user_id, access_token, finding_fingerprint)
    rows = _request_json(
        f"{_project_url()}/rest/v1/subscription_usage_confirmations?select={quote(_COLUMNS, safe=',')}",
        access_token,
        method="POST",
        body={
            "id": str(uuid4()),
            "user_id": user_id,
            "finding_id": finding_id,
            "usage_answer": request.usage_answer,
            "confirmed_at": confirmed_at.isoformat(),
        },
        prefer="return=representation",
    )
    if len(rows) != 1:
        raise HTTPException(status_code=503, detail="Subscription usage could not be saved.")
    return _parse(rows[0], user_id, finding_id)


def usage_payload(
    confirmation: SubscriptionUsageConfirmation | None,
) -> dict[str, object]:
    if confirmation is None:
        return {
            "usage_answer": None,
            "usage_confirmed": False,
            "explanation": "Usage has not been confirmed by the user.",
        }
    return {
        "usage_answer": confirmation.usage_answer,
        "usage_confirmed": True,
        "confirmed_at": confirmation.confirmed_at.isoformat(),
        "explanation": _explanation(confirmation.usage_answer),
    }


def _resolve_subscription_finding(
    user_id: str, access_token: str, fingerprint: str
) -> str:
    if not fingerprint or len(fingerprint) > 64 or any(
        character not in "0123456789abcdefABCDEF" for character in fingerprint
    ):
        raise HTTPException(status_code=422, detail="The finding id is invalid.")
    rows = _request_json(
        _filter_url(
            "finding_registry",
            "id,user_id,leak_type,fingerprint",
            user_id,
            f"&fingerprint=eq.{quote(fingerprint, safe='')}&limit=1",
        ),
        access_token,
        method="GET",
    )
    if not rows:
        raise HTTPException(status_code=404, detail="That subscription finding was not found.")
    row = rows[0]
    if row.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="That finding belongs to a different user.")
    if row.get("fingerprint") != fingerprint:
        raise HTTPException(status_code=403, detail="That finding belongs to a different user.")
    if row.get("leak_type") != "subscription_leak":
        raise HTTPException(status_code=422, detail="Usage answers are only supported for subscription findings.")
    finding_id = row.get("id")
    try:
        return str(UUID(str(finding_id)))
    except (ValueError, TypeError):
        raise HTTPException(status_code=503, detail="Finding registry data is invalid.") from None


def _parse(
    row: dict[str, object], user_id: str, finding_id: str
) -> SubscriptionUsageConfirmation:
    if row.get("user_id") != user_id or row.get("finding_id") != finding_id:
        raise HTTPException(status_code=403, detail="That finding belongs to a different user.")
    row_id = row.get("id")
    answer = row.get("usage_answer")
    raw_time = row.get("confirmed_at")
    if not isinstance(row_id, str) or not isinstance(answer, str) or answer not in {
        "frequently", "sometimes", "rarely", "never", "not_sure"
    } or not isinstance(raw_time, str):
        raise HTTPException(status_code=503, detail="Subscription usage data is invalid.")
    parsed_answer = _parse_answer(answer)
    if parsed_answer is None:
        raise HTTPException(status_code=503, detail="Subscription usage data is invalid.")
    try:
        confirmed_at = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=503, detail="Subscription usage data is invalid.") from None
    if confirmed_at.tzinfo is None or confirmed_at.utcoffset() is None:
        raise HTTPException(status_code=503, detail="Subscription usage data is invalid.")
    return SubscriptionUsageConfirmation(
        id=row_id,
        user_id=user_id,
        finding_id=finding_id,
        usage_answer=parsed_answer,
        confirmed_at=confirmed_at,
    )


def _parse_answer(value: object) -> UsageAnswer | None:
    if value in {"frequently", "sometimes", "rarely", "never", "not_sure"}:
        return value  # type narrowed by the allowlist check above
    return None


def _explanation(answer: UsageAnswer) -> str:
    if answer == "never":
        return "You reported that you no longer use this service. The finding remains a review item; this answer does not prove savings or cancel the payment."
    if answer == "rarely":
        return "You reported rare usage. Review the value you get before deciding whether to keep the service."
    if answer == "sometimes":
        return "You reported occasional usage. This finding remains a review item and is not automatically treated as waste."
    if answer == "frequently":
        return "You reported frequent usage. The recurring payment remains visible, but it is not treated as unused."
    return "You are not sure about usage yet. The finding remains a potential review item."
