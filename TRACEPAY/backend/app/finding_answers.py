"""Authenticated, append-only storage for answers to targeted finding questions."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal
from urllib.parse import quote
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.finding_registry import _filter_url, _project_url, _request_json
from leak_intelligence.finding_questions import (
    StoredAnswer,
    is_valid_answer,
    latest_answers,
    parse_question_key,
)

logger = logging.getLogger("tracepay.finding_answers")

SKIPPED = "skipped"
_COLUMNS = "question_key,question_kind,answer,signature,status,answered_at"
# Newest rows first; one user cannot have more questions than this in practice.
_MAX_ROWS = 500


class FindingAnswerRequest(BaseModel):
    question_key: str = Field(min_length=3, max_length=120)
    answer: str = Field(min_length=1, max_length=40)
    signature: str = Field(default="", max_length=80)


class FindingSkipRequest(BaseModel):
    question_key: str = Field(min_length=3, max_length=120)
    signature: str = Field(default="", max_length=80)


def load_finding_answers(user_id: str, access_token: str) -> dict[str, StoredAnswer]:
    """Latest answer or skip per question for this user."""
    rows = _request_json(
        _filter_url(
            "finding_answers",
            _COLUMNS,
            user_id,
            f"&order=answered_at.desc&limit={_MAX_ROWS}",
        ),
        access_token,
        method="GET",
    )
    parsed = [item for item in (_parse(row) for row in rows) if item is not None]
    return latest_answers(parsed)


def save_finding_answer(
    user_id: str,
    access_token: str,
    request: FindingAnswerRequest,
    *,
    answered_at: datetime,
) -> StoredAnswer:
    kind = _checked_kind(request.question_key)
    if request.answer == SKIPPED or not is_valid_answer(kind, request.answer):
        raise HTTPException(status_code=422, detail="That is not one of the answers for this question.")
    return _insert(user_id, access_token, request.question_key, kind, request.answer, request.signature, "answered", answered_at)


def skip_finding_question(
    user_id: str,
    access_token: str,
    request: FindingSkipRequest,
    *,
    answered_at: datetime,
) -> StoredAnswer:
    kind = _checked_kind(request.question_key)
    return _insert(user_id, access_token, request.question_key, kind, SKIPPED, request.signature, "skipped", answered_at)


def answer_payload(stored: StoredAnswer) -> dict[str, object]:
    return {
        "saved": True,
        "question_key": stored.question_key,
        "status": stored.status,
        "answer": None if stored.status == "skipped" else stored.answer,
    }


def _checked_kind(question_key: str) -> str:
    parsed = parse_question_key(question_key)
    if parsed is None:
        raise HTTPException(status_code=422, detail="The question id is invalid.")
    return parsed[0]


def _insert(
    user_id: str,
    access_token: str,
    question_key: str,
    kind: str,
    answer: str,
    signature: str,
    status: Literal["answered", "skipped"],
    answered_at: datetime,
) -> StoredAnswer:
    rows = _request_json(
        f"{_project_url()}/rest/v1/finding_answers?select={quote(_COLUMNS, safe=',')}",
        access_token,
        method="POST",
        body={
            "id": str(uuid4()),
            "user_id": user_id,
            "question_key": question_key,
            "question_kind": kind,
            "answer": answer,
            "signature": signature,
            "status": status,
            "answered_at": answered_at.isoformat(),
        },
        prefer="return=representation",
    )
    stored = _parse(rows[0]) if len(rows) == 1 else None
    if stored is None:
        raise HTTPException(status_code=503, detail="Your answer could not be saved.")
    return stored


def _parse(row: dict[str, object]) -> StoredAnswer | None:
    key, kind, answer = row.get("question_key"), row.get("question_kind"), row.get("answer")
    status, raw_time = row.get("status"), row.get("answered_at")
    if not (
        isinstance(key, str)
        and isinstance(kind, str)
        and isinstance(answer, str)
        and status in {"answered", "skipped"}
    ):
        logger.warning("finding_answers_row_ignored reason=malformed")
        return None
    answered_at: datetime | None = None
    if isinstance(raw_time, str):
        try:
            answered_at = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
        except ValueError:
            answered_at = None
    signature = row.get("signature")
    try:
        return StoredAnswer(
            question_key=key,
            kind=kind,  # type: ignore[arg-type]
            answer=answer,
            signature=signature if isinstance(signature, str) else "",
            status=status,  # type: ignore[arg-type]
            answered_at=answered_at,
        )
    except ValueError:
        logger.warning("finding_answers_row_ignored reason=invalid_kind")
        return None
