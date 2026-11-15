"""BulkSMS (v2 REST API) sender for one-time login codes."""

import base64
import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.auth_errors import AuthError
from app.config import settings
from app.sms_usage import record_sms_usage

logger = logging.getLogger("tracepay.auth")

BULKSMS_MESSAGES_URL = "https://api.bulksms.com/v1/messages"
TIMEOUT_SECONDS = 10


def send_sms(to: str, body: str) -> None:
    """Send one SMS. Raises AuthError with a user-safe message; provider details are logged only."""
    token_id = settings.bulksms_token_id.strip()
    token_secret = settings.bulksms_token_secret.strip()
    if not token_id or not token_secret:
        logger.error("auth_sms_unavailable reason=bulksms_credentials_missing")
        raise AuthError(503, "SMS is not configured on the server. Contact support.")

    payload: dict[str, str] = {"to": to, "body": body}
    sender = settings.bulksms_sender_id.strip()
    if sender:
        payload["from"] = sender

    basic = base64.b64encode(f"{token_id}:{token_secret}".encode("utf-8")).decode("ascii")
    request = Request(
        BULKSMS_MESSAGES_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            response.read()
        record_sms_usage(outcome="sent", body=body)
        return
    except HTTPError as error:
        record_sms_usage(outcome="failed", body=body)
        detail = error.read()[:300].decode("utf-8", errors="replace")
        reason = _bulksms_reason(detail)
        logger.error("auth_sms_rejected status=%s reason=%s", error.code, reason)
        raise _map_status(error.code, reason) from None
    except (URLError, TimeoutError, OSError) as error:
        record_sms_usage(outcome="failed", body=body)
        logger.error("auth_sms_unreachable error_type=%s", type(error).__name__)
        raise AuthError(502, "Could not send the verification SMS. Please try again.") from None


def _bulksms_reason(raw: str) -> str:
    """BulkSMS error text (its 'detail' field when JSON). Safe to show: it describes the request, not credentials."""
    try:
        payload = json.loads(raw)
    except ValueError:
        payload = None
    text = payload.get("detail") if isinstance(payload, dict) else None
    if not isinstance(text, str) or not text.strip():
        text = raw
    return " ".join(text.split())[:200]


def _map_status(status: int, reason: str = "") -> AuthError:
    suffix = f" BulkSMS said: {reason}" if reason else ""
    if status == 400:
        return AuthError(400, f"BulkSMS rejected the message.{suffix}")
    if status == 402:
        return AuthError(503, "SMS credit is exhausted on the BulkSMS account. Top up BulkSMS and try again.")
    if status in (401, 403):
        return AuthError(
            502,
            "BulkSMS rejected the API credentials. Check BULKSMS_TOKEN_ID and BULKSMS_TOKEN_SECRET on the server.",
        )
    if status == 429:
        return AuthError(429, "Too many SMS attempts. Wait a few minutes and try again.")
    return AuthError(502, "Could not send the verification SMS. Please try again.")
