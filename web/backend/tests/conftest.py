from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, Optional

import pytest
from dotenv import load_dotenv
from jose import jwt

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
# .env may define SUPABASE_JWT_SECRET as an empty string (pending the real
# value), which `setdefault` would treat as "already set" -- force a test
# value whenever it's falsy, not just absent.
if not os.environ.get("SUPABASE_JWT_SECRET"):
    os.environ["SUPABASE_JWT_SECRET"] = "test-supabase-jwt-secret"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

from app.auth import AuthenticatedUser, get_current_user
from app.database import SessionLocal, get_db
from app.main import app
from app.models_db import (
    AnalysisResult,
    AuditLog,
    BackgroundJob,
    FrozenItem,
    LinkedAccount,
    Profile,
    Transaction,
)
from app.settings import settings


@pytest.fixture(scope="session")
def test_run_id() -> str:
    return f"pytest-{uuid.uuid4().hex[:8]}"


@pytest.fixture
def db_session(test_run_id: str) -> Iterator:
    db = SessionLocal()
    db.info["created_profile_ids"] = []
    schema_ready = False
    try:
        require_current_schema(db)
        schema_ready = True
        yield db
    finally:
        db.rollback()
        if schema_ready:
            cleanup_test_data(db, db.info["created_profile_ids"])
        db.close()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_email(test_run_id: str) -> str:
    return f"{test_run_id}-{uuid.uuid4().hex}@example.com"


def cleanup_test_data(db, profile_ids: list[uuid.UUID]) -> None:
    """Delete only the throwaway `profiles` rows (and dependents) this test
    session created -- never touches the real user's data, since we only
    ever act on IDs this fixture itself generated and recorded."""
    if not profile_ids:
        return
    db.query(AuditLog).filter(
        (AuditLog.actor_user_id.in_(profile_ids)) | (AuditLog.target_user_id.in_(profile_ids))
    ).delete(synchronize_session=False)
    db.query(AnalysisResult).filter(AnalysisResult.user_id.in_(profile_ids)).delete(synchronize_session=False)
    db.query(FrozenItem).filter(FrozenItem.user_id.in_(profile_ids)).delete(synchronize_session=False)
    db.query(Transaction).filter(Transaction.user_id.in_(profile_ids)).delete(synchronize_session=False)
    db.query(LinkedAccount).filter(LinkedAccount.user_id.in_(profile_ids)).delete(synchronize_session=False)
    db.query(BackgroundJob).filter(BackgroundJob.user_id.in_(profile_ids)).delete(synchronize_session=False)
    db.query(Profile).filter(Profile.id.in_(profile_ids)).delete(synchronize_session=False)
    db.execute(text("DELETE FROM auth.users WHERE id = ANY(:ids)"), {"ids": profile_ids})
    db.commit()


def require_current_schema(db) -> None:
    inspector = inspect(db.get_bind())
    table_names = set(inspector.get_table_names())
    required_tables = {"background_jobs", "audit_logs", "profiles"}
    frozen_item_columns = {column["name"] for column in inspector.get_columns("frozen_items")}
    missing = sorted(
        {f"{table} table" for table in required_tables - table_names}
        | ({"frozen_items.leak_id"} if "leak_id" not in frozen_item_columns else set())
    )
    if missing:
        pytest.skip(
            f"Database schema is not current; run Alembic migrations first. Missing: {', '.join(missing)}"
        )


def create_db_profile(db, role: str = "user", full_name: Optional[str] = None) -> Profile:
    """Insert a throwaway `profiles` row for a test, paired with a minimal
    matching `auth.users` row (Supabase enforces `profiles.id` as a real FK
    to `auth.users.id` -- you cannot insert an arbitrary UUID otherwise).
    Use with `override_current_user`, which bypasses real JWT verification,
    so this never needs to be a *fully* valid Supabase account, just one
    that satisfies the FK.
    """
    profile_id = uuid.uuid4()
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": profile_id, "email": f"{profile_id}@pytest.invalid"},
    )
    # Supabase runs a trigger on auth.users that auto-inserts a matching
    # `profiles` row (role defaults to "user") -- upsert rather than a plain
    # insert, since one may already exist from that trigger by the time we
    # get here.
    db.execute(
        text(
            "INSERT INTO profiles (id, role, full_name, created_at) "
            "VALUES (:id, :role, :full_name, :created_at) "
            "ON CONFLICT (id) DO UPDATE SET role = :role, full_name = :full_name"
        ),
        {
            "id": profile_id,
            "role": role,
            "full_name": full_name,
            "created_at": datetime.now(timezone.utc),
        },
    )
    db.commit()
    profile = db.query(Profile).filter(Profile.id == profile_id).one()
    db.info["created_profile_ids"].append(profile.id)
    return profile


def override_current_user(profile: Profile, email: str = "test@example.com") -> None:
    """Bypass real Supabase JWT verification in tests by overriding the dependency directly."""

    def _override() -> AuthenticatedUser:
        return AuthenticatedUser(id=profile.id, email=email, role=profile.role)

    app.dependency_overrides[get_current_user] = _override


def supabase_style_token(user_id: uuid.UUID, email: str) -> str:
    """Build a token shaped like a real Supabase Auth JWT, signed with the
    test SUPABASE_JWT_SECRET -- for the few tests that need to exercise real
    JWT verification rather than bypassing it via `override_current_user`."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


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
