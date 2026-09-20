from fastapi.testclient import TestClient

from app.main import app


def test_extraction_rejects_missing_token() -> None:
    response = TestClient(app).post(
        "/extraction/preview",
        files={"file": ("statement.pdf", b"not processed", "application/pdf")},
    )
    assert response.status_code == 401
