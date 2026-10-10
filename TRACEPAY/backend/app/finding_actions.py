"""Read finding guidance and append a user response with the user's access token.

Writes use the publishable key and the bearer token. They do not update the registry.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import datetime
from typing import Callable
from urllib.parse import quote
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.finding_registry import (
    _COLUMNS,
    _filter_url,
    _parse_registry_row,
    _project_url,
    _request_json,
)
from leak_intelligence.finding_diff import RegistryRow, RegistryScopeError
from leak_intelligence.finding_guidance import (
    ACTION_TYPES,
    FindingAction,
    FindingGuidance,
    InvalidActionNote,
    InvalidActionType,
    action_insert_payload,
    build_guidance,
    record_user_action,
    sanitise_note,
)
from leak_intelligence.finding_outcomes import OUTCOMES, FindingOutcomeCheck

logger = logging.getLogger("tracepay.finding_actions")

_ACTION_COLUMNS = "id,user_id,finding_id,action_type,note,created_at"
_OUTCOME_COLUMNS = "id,user_id,finding_id,statement_import_id,outcome,basis,checked_at"
LoadFinding = Callable[[str, str, str], RegistryRow | None]
LoadActions = Callable[[str, str, str], tuple[FindingAction, ...]]
SaveAction = Callable[[str, FindingAction], FindingAction]


class FindingActionRequest(BaseModel):
    action_type: str = Field(min_length=1, max_length=40)
    note: str | None = Field(default=None, max_length=280)


class FindingNotFound(Exception):
    """The finding is not visible to this user."""


def load_finding_guidance(user_id: str, access_token: str, finding_id: str) -> FindingGuidance:
    """Read one finding, its responses, and its outcome checks. This does not write."""
    guidance = _load(
        user_id,
        access_token,
        finding_id,
        load_finding=_load_finding,
        load_actions=_load_actions,
    )
    return replace(
        guidance,
        outcome_checks=_load_outcome_checks(user_id, access_token, finding_id),
    )


def save_finding_action(
    user_id: str,
    access_token: str,
    finding_id: str,
    request: FindingActionRequest,
    *,
    created_at: datetime,
) -> FindingGuidance:
    """Insert one response. The registry row is not updated."""
    guidance = _save(
        user_id,
        access_token,
        finding_id,
        request,
        created_at=created_at,
        load_finding=_load_finding,
        load_actions=_load_actions,
        save_action=_insert_action,
    )
    return replace(
        guidance,
        outcome_checks=_load_outcome_checks(user_id, access_token, finding_id),
    )


def guidance_payload(guidance: FindingGuidance) -> dict[str, object]:
    return {
        "finding_id": guidance.finding_id,
        "title": guidance.title,
        "detection_status": guidance.detection_status,
        "detection_status_label": guidance.detection_status_label,
        "user_response": guidance.user_response,
        "reason": guidance.reason,
        "evidence": [
            {"label": label, "value": value} for label, value in guidance.evidence
        ],
        "known": list(guidance.known),
        "uncertain": list(guidance.uncertain),
        "steps": list(guidance.steps),
        "actions": [
            {
                "id": action.id,
                "action_type": action.action_type,
                "note": action.note,
                "created_at": action.created_at.isoformat(),
            }
            for action in guidance.actions
            if action.id
        ],
        "outcome_checks": [
            {
                "id": check.id,
                "outcome": check.outcome,
                "basis": check.basis,
                "checked_at": check.checked_at.isoformat(),
            }
            for check in guidance.outcome_checks
            if check.id
        ],
    }


def _load(
    user_id: str,
    access_token: str,
    finding_id: str,
    *,
    load_finding: LoadFinding,
    load_actions: LoadActions,
) -> FindingGuidance:
    finding = _visible_finding(user_id, access_token, finding_id, load_finding)
    return build_guidance(finding, load_actions(user_id, access_token, finding_id))


def _save(
    user_id: str,
    access_token: str,
    finding_id: str,
    request: FindingActionRequest,
    *,
    created_at: datetime,
    load_finding: LoadFinding,
    load_actions: LoadActions,
    save_action: SaveAction,
) -> FindingGuidance:
    finding = _visible_finding(user_id, access_token, finding_id, load_finding)
    status_before = finding.status
    generation_before = finding.signature_generation
    signature_before = finding.material_signature
    try:
        unchanged, history = record_user_action(
            finding,
            load_actions(user_id, access_token, finding_id),
            actor_user_id=user_id,
            action_type=request.action_type,
            note=request.note,
            created_at=created_at,
            action_id=str(uuid4()),
        )
    except InvalidActionType as error:
        raise HTTPException(status_code=422, detail="That action is not supported.") from error
    except InvalidActionNote as error:
        raise HTTPException(
            status_code=422,
            detail="The note cannot be saved. Remove long numbers and keep it short.",
        ) from error
    if (
        unchanged.status != status_before
        or unchanged.signature_generation != generation_before
        or unchanged.material_signature != signature_before
    ):
        raise HTTPException(status_code=500, detail="Finding guidance could not be saved.")
    stored = save_action(access_token, history[-1])
    if stored.user_id != user_id or stored.finding_id != finding_id:
        raise HTTPException(status_code=403, detail="That finding belongs to a different user.")
    logger.info(
        "finding_action_recorded user_id_prefix=%s action_type=%s",
        user_id[:8],
        stored.action_type,
    )
    return build_guidance(unchanged, history[:-1] + (stored,))


def _visible_finding(
    user_id: str,
    access_token: str,
    finding_id: str,
    load_finding: LoadFinding,
) -> RegistryRow:
    try:
        finding = load_finding(user_id, access_token, finding_id)
    except RegistryScopeError as error:
        raise HTTPException(
            status_code=403,
            detail="That finding belongs to a different user.",
        ) from error
    if finding is None:
        raise FindingNotFound
    if finding.user_id != user_id:
        raise HTTPException(status_code=403, detail="That finding belongs to a different user.")
    return finding


def _load_finding(user_id: str, access_token: str, finding_id: str) -> RegistryRow | None:
    url = _filter_url(
        "finding_registry",
        _COLUMNS,
        user_id,
        f"&id=eq.{quote(finding_id, safe='')}",
    )
    rows = _request_json(url, access_token, method="GET")
    if not rows:
        return None
    return _parse_registry_row(rows[0], user_id)


def _load_outcome_checks(
    user_id: str,
    access_token: str,
    finding_id: str,
) -> tuple[FindingOutcomeCheck, ...]:
    url = _filter_url(
        "finding_outcome_checks",
        _OUTCOME_COLUMNS,
        user_id,
        (
            f"&finding_id=eq.{quote(finding_id, safe='')}"
            "&order=checked_at.asc&limit=100"
        ),
    )
    return tuple(
        _parse_outcome(row, user_id, finding_id)
        for row in _request_json(url, access_token, method="GET")
    )


def _parse_outcome(
    row: dict[str, object],
    user_id: str,
    finding_id: str,
) -> FindingOutcomeCheck:
    if row.get("user_id") != user_id or row.get("finding_id") != finding_id:
        raise HTTPException(status_code=403, detail="That finding belongs to a different user.")
    outcome = row.get("outcome")
    basis = row.get("basis")
    check_id = row.get("id")
    statement_import_id = row.get("statement_import_id")
    checked_at = row.get("checked_at")
    if (
        not isinstance(outcome, str)
        or outcome not in OUTCOMES
        or not isinstance(basis, str)
        or not isinstance(check_id, str)
        or not isinstance(statement_import_id, str)
        or not isinstance(checked_at, str)
    ):
        raise HTTPException(status_code=503, detail="Finding guidance data is invalid.")
    parsed = datetime.fromisoformat(checked_at.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None or _unsafe_basis(basis):
        raise HTTPException(status_code=503, detail="Finding guidance data is invalid.")
    return FindingOutcomeCheck(
        id=check_id,
        user_id=user_id,
        finding_id=finding_id,
        statement_import_id=statement_import_id,
        outcome=outcome,
        basis=basis,
        checked_at=parsed,
    )


def _unsafe_basis(basis: str) -> bool:
    if not basis.strip() or len(basis) > 400:
        return True
    run = 0
    for char in basis:
        if char.isdigit():
            run += 1
            if run >= 6:
                return True
        else:
            run = 0
    lowered = basis.lower()
    return "saved" in lowered or "fraud" in lowered


def _load_actions(user_id: str, access_token: str, finding_id: str) -> tuple[FindingAction, ...]:
    url = _filter_url(
        "finding_actions",
        _ACTION_COLUMNS,
        user_id,
        (
            f"&finding_id=eq.{quote(finding_id, safe='')}"
            "&order=created_at.asc&limit=100"
        ),
    )
    return tuple(
        _parse_action(row, user_id, finding_id)
        for row in _request_json(url, access_token, method="GET")
    )


def _insert_action(access_token: str, action: FindingAction) -> FindingAction:
    if action.action_type not in ACTION_TYPES:
        raise HTTPException(status_code=422, detail="That action is not supported.")
    url = (
        f"{_project_url()}/rest/v1/finding_actions"
        f"?select={quote(_ACTION_COLUMNS, safe=',')}"
    )
    rows = _request_json(
        url,
        access_token,
        method="POST",
        body=action_insert_payload(action),
        prefer="return=representation",
    )
    if len(rows) != 1:
        raise HTTPException(status_code=503, detail="Finding guidance is temporarily unavailable.")
    return _parse_action(rows[0], action.user_id, action.finding_id)


def _parse_action(row: dict[str, object], user_id: str, finding_id: str) -> FindingAction:
    if row.get("user_id") != user_id or row.get("finding_id") != finding_id:
        raise HTTPException(status_code=403, detail="That finding belongs to a different user.")
    action_type = row.get("action_type")
    if not isinstance(action_type, str) or action_type not in ACTION_TYPES:
        raise HTTPException(status_code=503, detail="Finding guidance data is invalid.")
    note = row.get("note")
    if note is not None and not isinstance(note, str):
        raise HTTPException(status_code=503, detail="Finding guidance data is invalid.")
    action_id = row.get("id")
    created_at = row.get("created_at")
    if not isinstance(action_id, str) or not action_id.strip() or not isinstance(created_at, str):
        raise HTTPException(status_code=503, detail="Finding guidance data is invalid.")
    parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise HTTPException(status_code=503, detail="Finding guidance data is invalid.")
    try:
        cleaned = sanitise_note(note)
    except InvalidActionNote:
        cleaned = None
    return FindingAction(
        id=action_id,
        user_id=user_id,
        finding_id=finding_id,
        action_type=action_type,
        note=cleaned,
        created_at=parsed,
    )
