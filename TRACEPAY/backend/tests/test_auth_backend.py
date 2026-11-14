"""Tests for the FastAPI auth port (phone + SMS code sign-in). Supabase and BulkSMS are faked."""

import base64
import hashlib
import io
import json
import re
from typing import Any
from urllib.error import HTTPError
from urllib.parse import parse_qs, unquote, urlparse

import pytest
from fastapi.testclient import TestClient

from app import auth_reset_token, auth_service, auth_sms
from app.auth_errors import AuthError
from app.config import settings
from app.main import app

SECRET = "tracepay-reset-token-secret-for-tests-32b"


@pytest.fixture(autouse=True)
def auth_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-role-key-for-tests")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon-key-for-tests")
    monkeypatch.setattr(settings, "supabase_key", "")
    monkeypatch.setattr(settings, "auth_reset_token_secret", SECRET)
    monkeypatch.setattr(settings, "bulksms_token_id", "token-id-for-tests")
    monkeypatch.setattr(settings, "bulksms_token_secret", "token-secret-for-tests")
    monkeypatch.setattr(settings, "bulksms_sender_id", "TRACEPAY")
    auth_reset_token.clear_used_reset_tokens_for_tests()


# --- Phone rules ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0821234567", "+27821234567"),
        ("+27 82 123 4567", "+27821234567"),
        ("27821234567", "+27821234567"),
        ("821234567", "+27821234567"),
    ],
)
def test_normalize_sa_phone_accepts_common_formats(raw: str, expected: str) -> None:
    assert auth_service.require_valid_phone(raw) == expected


def test_invalid_phone_is_rejected_with_400() -> None:
    with pytest.raises(AuthError) as info:
        auth_service.require_valid_phone("12345")
    assert info.value.status_code == 400


# --- Reset tokens ---------------------------------------------------------------


def test_reset_token_round_trip_is_single_use() -> None:
    token = auth_reset_token.create_reset_token("user-1", "+27821234567")
    assert auth_reset_token.consume_reset_token(token, "+27821234567") == "user-1"
    with pytest.raises(AuthError):
        auth_reset_token.consume_reset_token(token, "+27821234567")


def test_reset_token_rejects_other_phone() -> None:
    token = auth_reset_token.create_reset_token("user-1", "+27821234567")
    with pytest.raises(AuthError):
        auth_reset_token.consume_reset_token(token, "+27829999999")


def test_reset_token_rejects_expired() -> None:
    token = auth_reset_token.create_reset_token("user-1", "+27821234567", now_ms=1_000)
    with pytest.raises(AuthError):
        auth_reset_token.consume_reset_token(token, "+27821234567", now_ms=10_000_000_000)


def test_reset_token_fails_closed_with_short_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_reset_token_secret", "short")
    with pytest.raises(AuthError) as info:
        auth_reset_token.create_reset_token("user-1", "+27821234567")
    assert info.value.status_code == 503


# --- BulkSMS --------------------------------------------------------------------


def test_send_sms_posts_basic_auth_and_sender(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    class _Response:
        status = 201

        def __enter__(self) -> "_Response":
            return self

        def __exit__(self, *_exc: object) -> None:
            return None

        def read(self) -> bytes:
            return b"{}"

    def fake_urlopen(request: Any, timeout: float) -> _Response:
        captured["url"] = request.full_url
        captured["auth"] = request.get_header("Authorization")
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return _Response()

    monkeypatch.setattr(auth_sms, "urlopen", fake_urlopen)
    auth_sms.send_sms("+27821234567", "Your TRACEPAY code is 123456")

    assert captured["url"] == "https://api.bulksms.com/v1/messages"
    expected = base64.b64encode(b"token-id-for-tests:token-secret-for-tests").decode()
    assert captured["auth"] == f"Basic {expected}"
    assert captured["body"] == {
        "to": "+27821234567",
        "body": "Your TRACEPAY code is 123456",
        "from": "TRACEPAY",
    }


def test_send_sms_shows_bulksms_reason_for_400(monkeypatch: pytest.MonkeyPatch) -> None:
    body = b'{"status":400,"detail":"An INTERNATIONAL \'from\' value cannot have more than 15 digits"}'

    def fake_urlopen(request: Any, timeout: float) -> None:
        raise HTTPError(request.full_url, 400, "Bad Request", {}, io.BytesIO(body))

    monkeypatch.setattr(auth_sms, "urlopen", fake_urlopen)
    with pytest.raises(AuthError) as info:
        auth_sms.send_sms("+27821234567", "code")
    assert info.value.status_code == 400
    assert "cannot have more than 15 digits" in info.value.message


@pytest.mark.parametrize(
    ("status", "expected_status"),
    [(400, 400), (402, 503), (401, 502), (429, 429), (500, 502)],
)
def test_send_sms_maps_provider_errors(
    monkeypatch: pytest.MonkeyPatch, status: int, expected_status: int
) -> None:
    def fake_urlopen(request: Any, timeout: float) -> None:
        raise HTTPError(request.full_url, status, "error", {}, io.BytesIO(b"detail"))

    monkeypatch.setattr(auth_sms, "urlopen", fake_urlopen)
    with pytest.raises(AuthError) as info:
        auth_sms.send_sms("+27821234567", "code")
    assert info.value.status_code == expected_status


# --- OTP store (fake Supabase table) --------------------------------------------


class FakeOtpTable:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.sent: list[str] = []
        self._next_id = 1

    def _phone_from_path(self, path: str) -> str:
        match = re.search(r"phone=eq\.([^&]+)", path)
        assert match, path
        return unquote(match.group(1))

    def __call__(self, method: str, path: str, *, headers: dict[str, str], body: Any = None) -> tuple[int, Any]:
        assert path.startswith("/rest/v1/auth_otp_codes"), path
        if method == "POST":
            row = {
                "id": f"row-{self._next_id}",
                "phone": body["phone"],
                "code_hash": body["code_hash"],
                "expires_at": body["expires_at"],
                "attempts": 0,
                "created_at": self._next_id,
            }
            self._next_id += 1
            self.rows.append(row)
            return 201, [row]
        if method == "GET":
            phone = self._phone_from_path(path)
            matches = sorted(
                (row for row in self.rows if row["phone"] == phone),
                key=lambda row: row["created_at"],
                reverse=True,
            )
            return 200, [{k: row[k] for k in ("id", "code_hash", "attempts", "expires_at")} for row in matches[:1]]
        if method == "PATCH":
            row_id = parse_qs(urlparse(path).query)["id"][0].removeprefix("eq.")
            for row in self.rows:
                if row["id"] == row_id:
                    row["attempts"] = body["attempts"]
            return 204, None
        if method == "DELETE" and "id=eq." in path:
            row_id = parse_qs(urlparse(path).query)["id"][0].removeprefix("eq.")
            self.rows = [row for row in self.rows if row["id"] != row_id]
            return 204, None
        if method == "DELETE":
            phone = self._phone_from_path(path)
            self.rows = [row for row in self.rows if row["phone"] != phone]
            return 204, None
        raise AssertionError(f"unexpected {method} {path}")


@pytest.fixture
def otp_table(monkeypatch: pytest.MonkeyPatch) -> FakeOtpTable:
    table = FakeOtpTable()
    monkeypatch.setattr(auth_service, "_supabase", table)
    monkeypatch.setattr(auth_service, "send_sms", lambda phone, body: table.sent.append(body))
    return table


def _code_from(table: FakeOtpTable) -> str:
    return re.search(r"(\d{6})$", table.sent[-1]).group(1)  # type: ignore[union-attr]


def test_otp_round_trip_accepts_the_sent_code(otp_table: FakeOtpTable) -> None:
    auth_service.send_otp("+27821234567")
    code = _code_from(otp_table)
    assert otp_table.rows[0]["code_hash"] == hashlib.sha256(code.encode()).hexdigest()

    auth_service.check_otp("+27821234567", code)
    assert otp_table.rows == []


def test_otp_stores_only_a_hash(otp_table: FakeOtpTable) -> None:
    auth_service.send_otp("+27821234567")
    code = _code_from(otp_table)
    assert code not in json.dumps(otp_table.rows)


def test_otp_locks_after_max_wrong_attempts(otp_table: FakeOtpTable) -> None:
    auth_service.send_otp("+27821234567")
    correct = _code_from(otp_table)
    wrong = "000000" if correct != "000000" else "111111"

    for _ in range(auth_service.OTP_MAX_ATTEMPTS):
        with pytest.raises(AuthError):
            auth_service.check_otp("+27821234567", wrong)

    with pytest.raises(AuthError):
        auth_service.check_otp("+27821234567", correct)


def test_new_code_replaces_the_old_one(otp_table: FakeOtpTable) -> None:
    auth_service.send_otp("+27821234567")
    first = _code_from(otp_table)
    auth_service.send_otp("+27821234567")
    second = _code_from(otp_table)
    assert len(otp_table.rows) == 1
    if first != second:
        with pytest.raises(AuthError):
            auth_service.check_otp("+27821234567", first)


def test_failed_sms_removes_the_stored_code(otp_table: FakeOtpTable, monkeypatch: pytest.MonkeyPatch) -> None:
    def failing_sms(phone: str, body: str) -> None:
        raise AuthError(502, "Could not send the verification SMS. Please try again.")

    monkeypatch.setattr(auth_service, "send_sms", failing_sms)
    with pytest.raises(AuthError):
        auth_service.send_otp("+27821234567")
    assert otp_table.rows == []


# --- HTTP shape -----------------------------------------------------------------


def test_login_rejects_bad_phone_with_error_body() -> None:
    response = TestClient(app).post("/auth/login", json={"phone": "123", "password": "x"})
    assert response.status_code == 400
    assert response.json() == {"error": "Enter a valid SA mobile number (9 digits after +27)."}


def test_register_rejects_short_password_with_error_body() -> None:
    response = TestClient(app).post(
        "/auth/register",
        json={"fullName": "Test User", "phone": "0821234567", "password": "short"},
    )
    assert response.status_code == 400
    assert response.json() == {"error": "Password must be at least 8 characters."}
