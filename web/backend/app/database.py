from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Supabase uses PostgreSQL, so we'll use the DATABASE_URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./tracepay.db"  # Fallback to SQLite for local dev
)

# Supabase connection string format: postgresql://user:password@host:port/database
# Or: postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

if DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://"):
    # For Supabase/PostgreSQL, use connection pooling
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Verify connections before using
        pool_size=5,  # Connection pool size
        max_overflow=10,  # Max overflow connections
    )
else:
    # SQLite (for local development)
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency for FastAPI to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()