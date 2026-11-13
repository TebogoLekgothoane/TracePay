"""Phone + password auth with SMS one-time codes. Port of the former Node auth service.

Talks to Supabase over REST (service role for admin/table work, publishable key for password grants),
matching the pattern used by app/billing.py. Blocking urllib calls: run from sync FastAPI routes.
"""

import hashlib
import hmac
import json
import logging
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.auth_errors import AuthError
from app.auth_reset_token import consume_reset_token, create_reset_token
from app.auth_sms import send_sms
from app.config import _jwt_role, settings

logger = logging.getLogger("tracepay.auth")

PHONE_RE = re.compile(r"^\+27\d{9}$")
OTP_TTL_SECONDS = 10 * 60
OTP_MAX_ATTEMPTS = 5
FORGOT_COOLDOWN_SECONDS = 30
TIMEOUT_SECONDS = 10

_forgot_lock = threading.Lock()
_last_forgot_at: dict[str, float] = {}


# --- Phone helpers -------------------------------------------------------------


def normalize_sa_phone(phone: str) -> str:
    digits = re.sub(r"\s", "", phone)
    if digits.startswith("+27"):
        rest = digits[3:]
    elif digits.startswith("27"):
        rest = digits[2:]
    elif digits.startswith("0"):
        rest = digits[1:]
    else:
        rest = digits
    return "+27" + re.sub(r"\D", "", rest)


def require_valid_phone(phone: str) -> str:
    normalized = normalize_sa_phone(phone)
    if not PHONE_RE.match(normalized):
        raise AuthError(400, "Enter a valid SA mobile number (9 digits after +27).")
    return normalized


# --- Supabase REST -------------------------------------------------------------


def _check_supabase_config() -> None:
    url = settings.supabase_url.strip()
    service_key = settings.supabase_service_role_key.strip()
    anon_key = settings.supabase_publishable_key()
    if not url or not service_key or not anon_key:
        raise AuthError(
            503,
            "Auth server is missing Supabase keys. Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
        )
    if anon_key == service_key:
        raise AuthError(503, "SUPABASE_ANON_KEY must be the publishable/anon key. It matches the service-role key.")
    if _jwt_role(service_key) == "anon":
        raise AuthError(503, "SUPABASE_SERVICE_ROLE_KEY must be the service-role key, not the anon key.")


def _service_headers() -> dict[str, str]:
    _check_supabase_config()
    key = settings.supabase_service_role_key.strip()
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _anon_headers() -> dict[str, str]:
    _check_supabase_config()
    return {"apikey": settings.supabase_publishable_key()}


def _supabase(
    method: str,
    path: str,
    *,
    headers: dict[str, str],
    body: Any | None = None,
) -> tuple[int, Any]:
    """Returns (status, parsed_json_or_None). Transport failures raise AuthError."""
    base = settings.supabase_url.strip().rstrip("/")
    request_headers = {**headers, "Accept": "application/json"}
    data = None
    if body is not None:
        request_headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = Request(f"{base}{path}", data=data, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            raw = response.read().decode("utf-8")
    except HTTPError as error:
        status = error.code
        raw = error.read().decode("utf-8", errors="replace")
    except (URLError, TimeoutError, OSError) as error:
        logger.error("auth_supabase_unreachable path=%s error_type=%s", path.split("?")[0], type(error).__name__)
        raise AuthError(502, "Could not reach the account service. Please try again.") from None

    try:
        parsed = json.loads(raw) if raw else None
    except ValueError:
        parsed = None
    return status, parsed


def _error_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        for key in ("msg", "message", "error_description", "error"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
    return fallback


def _find_user_by_phone(phone: str) -> dict[str, Any] | None:
    status, rows = _supabase(
        "GET",
        f"/rest/v1/profiles?select=id&phone=eq.{quote(phone, safe='')}&limit=1",
        headers=_service_headers(),
    )
    if status >= 300:
        logger.error("auth_profile_lookup_failed status=%s", status)
        raise AuthError(500, "Could not look up that account.")
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        return None
    user_id = rows[0].get("id")
    if not isinstance(user_id, str) or not user_id:
        return None

    status, user = _supabase("GET", f"/auth/v1/admin/users/{quote(user_id, safe='')}", headers=_service_headers())
    if status >= 300 or not isinstance(user, dict) or not isinstance(user.get("id"), str):
        return None
    return user


def _password_session(phone: str, password: str) -> dict[str, str] | None:
    status, body = _supabase(
        "POST",
        "/auth/v1/token?grant_type=password",
        headers=_anon_headers(),
        body={"phone": phone, "password": password},
    )
    if status >= 300 or not isinstance(body, dict) or not isinstance(body.get("access_token"), str):
        return None
    return {"accessToken": body["access_token"], "refreshToken": str(body.get("refresh_token", ""))}


def _update_user(user_id: str, fields: dict[str, Any], failure: str) -> None:
    status, body = _supabase(
        "PUT",
        f"/auth/v1/admin/users/{quote(user_id, safe='')}",
        headers=_service_headers(),
        body=fields,
    )
    if status >= 300:
        logger.error("auth_user_update_failed status=%s detail=%s", status, _error_message(body, "")[:200])
        raise AuthError(400, failure)


# --- OTP storage and delivery --------------------------------------------------


def _hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _otp_rows_path(phone: str) -> str:
    return f"/rest/v1/auth_otp_codes?phone=eq.{quote(phone, safe='')}"


def send_otp(phone: str) -> None:
    code = f"{secrets.randbelow(900_000) + 100_000:06d}"
    headers = _service_headers()

    status, _ = _supabase("DELETE", _otp_rows_path(phone), headers=headers)
    if status >= 300:
        logger.error("auth_otp_clear_failed status=%s", status)
        raise AuthError(500, "Could not start verification. Please try again.")

    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=OTP_TTL_SECONDS)).isoformat()
    status, inserted = _supabase(
        "POST",
        "/rest/v1/auth_otp_codes",
        headers={**headers, "Prefer": "return=representation"},
        body={"phone": phone, "code_hash": _hash_otp(code), "expires_at": expires_at},
    )
    if status >= 300 or not isinstance(inserted, list) or not inserted or not isinstance(inserted[0], dict):
        logger.error("auth_otp_insert_failed status=%s", status)
        raise AuthError(500, "Could not start verification. Please try again.")
    row_id = inserted[0].get("id")

    try:
        send_sms(phone, f"Your TRACEPAY code is {code}")
    except AuthError:
        # Never delivered, so drop the row rather than leave an unusable code behind.
        if isinstance(row_id, str):
            _supabase("DELETE", f"/rest/v1/auth_otp_codes?id=eq.{quote(row_id, safe='')}", headers=headers)
        raise


def check_otp(phone: str, code: str) -> None:
    token = re.sub(r"\s", "", code)
    if len(token) < 6:
        raise AuthError(400, "Enter the 6-digit code from your SMS.")

    headers = _service_headers()
    status, rows = _supabase(
        "GET",
        f"{_otp_rows_path(phone)}&select=id,code_hash,attempts,expires_at&order=created_at.desc&limit=1",
        headers=headers,
    )
    if status >= 300:
        raise AuthError(500, "Could not check the verification code. Please try again.")

    invalid = AuthError(400, "Invalid verification code. Please try again.")
    row = rows[0] if isinstance(rows, list) and rows and isinstance(rows[0], dict) else None
    if row is None:
        raise invalid
    try:
        expires_at = datetime.fromisoformat(str(row.get("expires_at")))
    except ValueError:
        raise invalid from None
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    attempts = int(row.get("attempts") or 0)
    if expires_at < datetime.now(timezone.utc) or attempts >= OTP_MAX_ATTEMPTS:
        raise invalid

    if not hmac.compare_digest(str(row.get("code_hash", "")), _hash_otp(token)):
        _supabase(
            "PATCH",
            f"/rest/v1/auth_otp_codes?id=eq.{quote(str(row.get('id')), safe='')}",
            headers={**headers, "Prefer": "return=minimal"},
            body={"attempts": attempts + 1},
        )
        raise invalid

    _supabase("DELETE", _otp_rows_path(phone), headers=headers)


# --- Public auth operations ----------------------------------------------------


def register(full_name: str, phone_raw: str, password: str) -> None:
    name = full_name.strip()
    phone = require_valid_phone(phone_raw)
    if len(name) < 2:
        raise AuthError(400, "Enter your full name.")
    if len(password) < 8:
        raise AuthError(400, "Password must be at least 8 characters.")

    if _find_user_by_phone(phone) is not None:
        raise AuthError(409, "This phone number is already registered. Log in instead.")

    status, body = _supabase(
        "POST",
        "/auth/v1/admin/users",
        headers=_service_headers(),
        body={
            "phone": phone,
            "password": password,
            "phone_confirm": False,
            "user_metadata": {"full_name": name},
        },
    )
    if status >= 300:
        message = _error_message(body, "Could not create your account.")
        if "already" in message.lower():
            raise AuthError(409, "This phone number is already registered. Log in instead.")
        raise AuthError(400, message)

    send_otp(phone)


def login(phone_raw: str, password: str) -> dict[str, Any]:
    phone = require_valid_phone(phone_raw)
    if not password:
        raise AuthError(400, "Enter your password.")

    session = _password_session(phone, password)
    if session is not None:
        return {"requiresOtp": False, "session": session}

    user = _find_user_by_phone(phone)
    if user is None:
        raise AuthError(404, "This phone number is not registered.")
    if not user.get("phone_confirmed_at"):
        # Do not send an OTP on a failed password attempt; the app uses the rate-limited resend route.
        return {"requiresOtp": True, "session": None}
    raise AuthError(401, "Incorrect password.")


def verify_otp(phone_raw: str, code: str, password: str, purpose: str) -> dict[str, Any]:
    phone = require_valid_phone(phone_raw)
    check_otp(phone, code)

    user = _find_user_by_phone(phone)
    if user is None:
        raise AuthError(400, "Verification session expired. Please start again.")
    _update_user(user["id"], {"phone_confirm": True}, "Could not confirm this phone number.")

    if purpose == "reset":
        return {
            "requiresOtp": False,
            "session": None,
            "resetAllowed": True,
            "resetToken": create_reset_token(user["id"], phone),
        }
    if not password:
        return {"requiresOtp": False, "session": None}

    session = _password_session(phone, password)
    if session is None:
        raise AuthError(401, "Phone verified. Log in with your password.")
    return {"requiresOtp": False, "session": session}


def forgot_password(phone_raw: str) -> None:
    phone = require_valid_phone(phone_raw)
    now = time.monotonic()
    with _forgot_lock:
        last = _last_forgot_at.get(phone, 0.0)
        if now - last < FORGOT_COOLDOWN_SECONDS:
            raise AuthError(429, "Wait a moment before requesting another code.")
        _last_forgot_at[phone] = now

    if _find_user_by_phone(phone) is None:
        return  # Same response either way, so the endpoint does not reveal registered numbers.
    send_otp(phone)


def reset_password(phone_raw: str, password: str, reset_token: str) -> dict[str, Any]:
    phone = require_valid_phone(phone_raw)
    if len(password) < 8:
        raise AuthError(400, "Password must be at least 8 characters.")
    if not reset_token:
        raise AuthError(400, "Verification session expired. Please start again.")

    user_id = consume_reset_token(reset_token, phone)
    _update_user(
        user_id,
        {"password": password, "phone_confirm": True},
        "Could not update your password. Please try again.",
    )
    session = _password_session(phone, password)
    if session is None:
        raise AuthError(401, "Phone verified. Log in with your password.")
    return {"requiresOtp": False, "session": session}


def resend_otp(phone_raw: str) -> None:
    phone = require_valid_phone(phone_raw)
    if _find_user_by_phone(phone) is None:
        return
    send_otp(phone)
