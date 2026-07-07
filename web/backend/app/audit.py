from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from .models_db import AuditLog, User


def add_audit_event(
    db: Session,
    event_type: str,
    *,
    actor: User | None = None,
    target_user: User | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditLog:
    request_metadata: dict[str, Any] = {}
    ip_address = None
    user_agent = None
    if request is not None:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        request_metadata["method"] = request.method
        request_metadata["path"] = request.url.path

    audit_log = AuditLog(
        event_type=event_type,
        actor_user_id=actor.id if actor is not None else None,
        target_user_id=target_user.id if target_user is not None else None,
        ip_address=ip_address,
        user_agent=user_agent,
        event_metadata={**request_metadata, **(metadata or {})},
    )
    db.add(audit_log)
    return audit_log
