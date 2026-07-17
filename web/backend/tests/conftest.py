from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from typing import Iterator

import pytest
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_ROOT / ".env")

if test_database_url := os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = test_database_url

database_url = os.getenv("DATABASE_URL", "")
if not database_url:
    pytest.skip(
        "DATABASE_URL or TEST_DATABASE_URL is required for integration tests.",
        allow_module_level=True,
    )
if database_url.startswith("sqlite"):
    pytest.skip(
        "SQLite is not supported for these tests. Use a Supabase/PostgreSQL test database.",
        allow_module_level=True,
    )

os.environ.setdefault("SECRET_KEY", "test-secret-key")

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.exc import OperationalError

from app.auth import get_password_hash
from app.database import SessionLocal, get_db
from app.main import app
from app.models_db import AuditLog, AnalysisResult, FrozenItem, LinkedAccount, Transaction, User
from app.routers.auth import _AUTH_RATE_LIMITS


@pytest.fixture(scope="session")
def test_run_id() -> str:
    return f"pytest-{uuid.uuid4().hex[:8]}"


@pytest.fixture
def db_session(test_run_id: str) -> Iterator:
    db = SessionLocal()
    schema_ready = False
    try:
        require_current_schema(db)
        schema_ready = True
        yield db
    finally:
        db.rollback()
        if schema_ready:
            cleanup_test_data(db, test_run_id)
        db.close()


@pytest.fixture
def client() -> Iterator[TestClient]:
    _AUTH_RATE_LIMITS.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    _AUTH_RATE_LIMITS.clear()


@pytest.fixture
def test_email(test_run_id: str) -> str:
    return f"{test_run_id}-{uuid.uuid4().hex}@example.com"


def cleanup_test_data(db, test_run_id: str) -> None:
    users = db.query(User).filter(User.email.like(f"{test_run_id}-%")).all()
    user_ids = [user.id for user in users]
    if user_ids:
        db.query(AuditLog).filter(
            (AuditLog.actor_user_id.in_(user_ids)) | (AuditLog.target_user_id.in_(user_ids))
        ).delete(synchronize_session=False)
        db.query(AnalysisResult).filter(AnalysisResult.user_id.in_(user_ids)).delete(
            synchronize_session=False
        )
        db.query(FrozenItem).filter(FrozenItem.user_id.in_(user_ids)).delete(
            synchronize_session=False
        )
        db.query(Transaction).filter(Transaction.user_id.in_(user_ids)).delete(
            synchronize_session=False
        )
        db.query(LinkedAccount).filter(LinkedAccount.user_id.in_(user_ids)).delete(
            synchronize_session=False
        )
        db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
        db.commit()


def require_current_schema(db) -> None:
    inspector = inspect(db.get_bind())
    table_names = set(inspector.get_table_names())
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    frozen_item_columns = {
        column["name"] for column in inspector.get_columns("frozen_items")
    }
    required_user_columns = {
        "email_verified_at",
        "auth_token_version",
        "failed_login_attempts",
        "login_cooldown_until",
    }
    required_frozen_item_columns = {"leak_id"}
    required_tables = {"background_jobs", "audit_logs"}
    missing = sorted(
        (required_user_columns - user_columns)
        | {
            f"frozen_items.{column}"
            for column in required_frozen_item_columns - frozen_item_columns
        }
        | {f"{table} table" for table in required_tables - table_names}
    )
    if missing:
        pytest.skip(
            f"Database schema is not current; run Alembic migrations first. Missing: {', '.join(missing)}"
        )


def create_db_user(
    db, email: str, password: str = "Password123!", role: str = "user"
) -> User:
    user = User(
        email=email.strip().lower(),
        password_hash=get_password_hash(password),
        role=role,
        is_active=True,
        auth_token_version=0,
        failed_login_attempts=0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class BrokenQuerySession:
    def query(self, *_args, **_kwargs):
        raise OperationalError("SELECT 1", {}, Exception("database unavailable"))

    def close(self) -> None:
        return None


class BrokenCommitSession:
    def query(self, *_args, **_kwargs):
        class EmptyQuery:
            def filter(self, *_args, **_kwargs):
                return self

            def first(self):
                return None

        return EmptyQuery()

    def add(self, _item) -> None:
        return None

    def flush(self) -> None:
        return None

    def commit(self) -> None:
        raise OperationalError("COMMIT", {}, Exception("database unavailable"))

    def rollback(self) -> None:
        return None

    def close(self) -> None:
        return None


def override_db_with(session_obj):
    def override_get_db():
        try:
            yield session_obj
        finally:
            session_obj.close()

    app.dependency_overrides[get_db] = override_get_db
