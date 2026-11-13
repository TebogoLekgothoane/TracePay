"""Phone reading ingestion (bank SMS and notifications). Port of the former Node ingestion service.

Validates each batch, upserts ingestion_readings (service role), then writes parsed_transactions.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.auth_errors import AuthError
from app.auth_service import _service_headers, _supabase
from app.ingestion_parser import build_parsed_rows

logger = logging.getLogger("tracepay.ingestion")

MAX_BATCH_SIZE = 100
MAX_CLIENT_ID = 128
MAX_BODY = 4000
MAX_SENDER = 128
MAX_APP_IDENTIFIER = 256
MAX_TITLE = 256
MAX_METADATA_BYTES = 8192
MAX_FUTURE_MS = 5 * 60 * 1000

# Per-reading JSON overhead for keys, punctuation and ISO timestamps; keep in sync with the Node limits.
_PER_READING_JSON_OVERHEAD = 512
_BATCH_ENVELOPE_OVERHEAD = 4096
MAX_INGESTION_JSON_BYTES = (
    MAX_BATCH_SIZE
    * (MAX_CLIENT_ID + MAX_BODY + MAX_METADATA_BYTES + MAX_SENDER + MAX_APP_IDENTIFIER + MAX_TITLE + _PER_READING_JSON_OVERHEAD)
    + _BATCH_ENVELOPE_OVERHEAD
)

_SOURCES = ("sms", "notification")
_USER_ID_FIELDS = ("user_id", "userId")


def _read_string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _read_optional(value: Any, max_length: int, field: str) -> str | None:
    text = _read_string(value)
    if not text:
        return None
    if len(text) > max_length:
        raise AuthError(400, f"{field} is too long.")
    return text


def _require(value: Any, max_length: int, field: str) -> str:
    text = _read_string(value)
    if not text:
        raise AuthError(400, f"{field} is required.")
    if len(text) > max_length:
        raise AuthError(400, f"{field} is too long.")
    return text


def _parse_received_at(raw: str) -> str:
    text = raw[:-1] + "+00:00" if raw[-1:] in ("Z", "z") else raw
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise AuthError(400, "receivedAt must be a valid timestamp.") from None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    utc = parsed.astimezone(timezone.utc)
    now_ms = datetime.now(timezone.utc).timestamp() * 1000
    if utc.timestamp() * 1000 > now_ms + MAX_FUTURE_MS:
        raise AuthError(400, "receivedAt cannot be in the future.")
    return utc.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _read_received_at(value: Any) -> str:
    return _parse_received_at(_require(value, 64, "receivedAt"))


def _read_metadata(value: Any) -> dict[str, Any]:
    metadata = value if isinstance(value, dict) else {}
    size = len(json.dumps(metadata, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    if size > MAX_METADATA_BYTES:
        raise AuthError(400, "metadata is too large.")
    return metadata


def _validate_reading(value: Any) -> dict[str, Any]:
    reading = value if isinstance(value, dict) else {}
    source = reading.get("source")
    if source not in _SOURCES:
        raise AuthError(400, "Reading source must be sms or notification.")
    sender = _read_optional(reading.get("sender"), MAX_SENDER, "sender")
    app_identifier = _read_optional(reading.get("appIdentifier"), MAX_APP_IDENTIFIER, "appIdentifier")

    if source == "sms" and not sender:
        raise AuthError(400, "sender is required for SMS readings.")
    if source == "sms" and app_identifier:
        raise AuthError(400, "SMS readings cannot include appIdentifier.")
    if source == "notification" and not app_identifier:
        raise AuthError(400, "appIdentifier is required for notification readings.")

    return {
        "client_id": _require(reading.get("clientId"), MAX_CLIENT_ID, "clientId"),
        "source": source,
        "received_at": _read_received_at(reading.get("receivedAt")),
        "sender": sender,
        "app_identifier": app_identifier,
        "title": _read_optional(reading.get("title"), MAX_TITLE, "title"),
        "body": _require(reading.get("body"), MAX_BODY, "body"),
        "metadata": _read_metadata(reading.get("metadata")),
    }


def _reject_foreign_user_id(record: Any, user_id: str) -> None:
    if not isinstance(record, dict):
        return
    for key in _USER_ID_FIELDS:
        if key not in record:
            continue
        claimed = record[key]
        if claimed is None or claimed == "":
            continue
        if isinstance(claimed, str) and claimed.strip() == user_id:
            continue
        raise AuthError(400, "user_id does not match the signed-in user.")


def validate_batch(body: Any, user_id: str) -> list[dict[str, Any]]:
    _reject_foreign_user_id(body, user_id)
    readings = body.get("readings") if isinstance(body, dict) else None
    if not isinstance(readings, list):
        raise AuthError(400, "readings must be an array.")
    if len(readings) < 1:
        raise AuthError(400, "Send at least one reading.")
    if len(readings) > MAX_BATCH_SIZE:
        raise AuthError(400, f"Send no more than {MAX_BATCH_SIZE} readings at once.")

    validated: list[dict[str, Any]] = []
    for reading in readings:
        _reject_foreign_user_id(reading, user_id)
        validated.append(_validate_reading(reading))
    return validated


def ingest_readings(user_id: str, body: Any) -> dict[str, Any]:
    if not user_id.strip():
        raise AuthError(401, "Sign in to sync phone readings.")

    updated_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    rows = [
        {**reading, "user_id": user_id, "updated_at": updated_at}
        for reading in validate_batch(body, user_id)
    ]

    status, stored = _supabase(
        "POST",
        "/rest/v1/ingestion_readings?on_conflict=user_id,source,client_id"
        "&select=id,user_id,client_id,source,received_at,sender,app_identifier,title,body",
        headers={**_service_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
        body=rows,
    )
    if status >= 300 or not isinstance(stored, list):
        logger.error("ingestion_store_failed status=%s", status)
        raise AuthError(500, "Could not sync phone readings. Please try again.")
    if any(not isinstance(row, dict) or row.get("user_id") != user_id for row in stored):
        raise AuthError(500, "Could not sync phone readings. Please try again.")

    try:
        parsed = build_parsed_rows(stored, user_id)
        if parsed:
            status, _ = _supabase(
                "POST",
                "/rest/v1/parsed_transactions?on_conflict=user_id,source,client_id",
                headers={**_service_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
                body=parsed,
            )
            if status >= 300:
                raise RuntimeError(f"parsed_transactions upsert status={status}")
    except Exception as error:  # noqa: BLE001 - any parse-store failure becomes one user-safe error
        logger.error(
            "ingestion_parse_persist_failed error_type=%s accepted=%s",
            type(error).__name__,
            len(stored),
        )
        raise AuthError(
            500,
            "Phone readings were received but could not be fully processed. Please try again.",
        ) from None

    return {
        "accepted": len(stored),
        "readings": [
            {
                "id": row.get("id"),
                "clientId": row.get("client_id"),
                "source": row.get("source"),
                "receivedAt": row.get("received_at"),
            }
            for row in stored
        ],
    }
