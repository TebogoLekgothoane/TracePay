from fastapi.testclient import TestClient
import asyncio
import base64
import json
from io import BytesIO
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.auth import require_supabase_user
from app.config import _jwt_role
from app.main import _reject_oversized_content_length, app, read_upload_capped


def _jwt(role: str) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"none"}').decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"role": role}).encode()).decode().rstrip("=")
    return f"{header}.{payload}.sig"


def test_jwt_role_detects_service_role_and_anon() -> None:
    assert _jwt_role(_jwt("service_role")) == "service_role"
    assert _jwt_role(_jwt("anon")) == "anon"


def test_extraction_rejects_missing_token() -> None:
    response = TestClient(app).post(
        "/extraction/preview",
        files={"file": ("statement.pdf", b"not processed", "application/pdf")},
    )
    assert response.status_code == 401


def test_extraction_rejects_non_pdf_bytes() -> None:
    app.dependency_overrides[require_supabase_user] = lambda: "user-id"
    try:
        response = TestClient(app).post(
            "/extraction/preview",
            files={"file": ("statement.pdf", b"not a pdf", "application/pdf")},
        )
        assert response.status_code == 415
    finally:
        app.dependency_overrides.clear()


def test_extraction_rejects_empty_upload() -> None:
    app.dependency_overrides[require_supabase_user] = lambda: "user-id"
    try:
        response = TestClient(app).post(
            "/extraction/preview",
            files={"file": ("statement.pdf", b"", "application/pdf")},
        )
        assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_read_upload_capped_rejects_without_buffering_past_limit() -> None:
    max_bytes = 64
    oversized = UploadFile(
        filename="statement.pdf",
        file=BytesIO(b"%PDF" + b"x" * max_bytes),
        headers=Headers({"content-type": "application/pdf"}),
    )
    with pytest.raises(HTTPException) as raised:
        asyncio.run(read_upload_capped(oversized, max_bytes))
    assert raised.value.status_code == 413


def test_read_upload_capped_accepts_exact_limit() -> None:
    max_bytes = 64
    exact = UploadFile(
        filename="statement.pdf",
        file=BytesIO(b"%PDF" + b"x" * (max_bytes - 4)),
        headers=Headers({"content-type": "application/pdf"}),
    )
    content = asyncio.run(read_upload_capped(exact, max_bytes))
    assert len(content) == max_bytes
    assert content.startswith(b"%PDF")


def test_reject_oversized_content_length() -> None:
    request = MagicMock()
    request.headers = {"content-length": str(21 * 1024 * 1024)}
    with pytest.raises(HTTPException) as raised:
        _reject_oversized_content_length(request)
    assert raised.value.status_code == 413


def test_reject_content_length_ignores_missing_or_valid() -> None:
    missing = MagicMock()
    missing.headers = {}
    _reject_oversized_content_length(missing)

    valid = MagicMock()
    valid.headers = {"content-length": str(1024)}
    _reject_oversized_content_length(valid)
