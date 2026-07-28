from __future__ import annotations

import uuid
from typing import Any, Union

from fastapi import Request
from sqlalchemy.orm import Session

from .auth import AuthenticatedUser
from .models_db import AuditLog, Profile

# Accepts either a resolved identity object (AuthenticatedUser/Profile) or a
# raw UUID directly, since some call sites only have a user_id on hand (e.g.
# a business record's `user_id` column) and shouldn't need to look up a
# Profile row just to log who it belongs to.
ActorLike = Union[AuthenticatedUser, Profile, uuid.UUID, None]


def _actor_id(actor: ActorLike) -> uuid.UUID | None:
    if actor is None:
        return None
    if isinstance(actor, uuid.UUID):
        return actor
    return actor.id


def add_audit_event(
    db: Session,
    event_type: str,
    *,
    actor: ActorLike = None,
    target_user: ActorLike = None,
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
        actor_user_id=_actor_id(actor),
        target_user_id=_actor_id(target_user),
        ip_address=ip_address,
        user_agent=user_agent,
        event_metadata={**request_metadata, **(metadata or {})},
    )
    db.add(audit_log)
    return audit_log
