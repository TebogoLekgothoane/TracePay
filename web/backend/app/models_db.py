from __future__ import annotations

from datetime import datetime
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    username = Column(String(255), unique=True, nullable=True)  # Keep for compatibility
    full_name = Column(String(255), nullable=True)  # Keep for compatibility
    email = Column(String(255), unique=False, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    role = Column(String(50), default="user", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    auth_token_version = Column(Integer, default=0, server_default="0", nullable=False)
    failed_login_attempts = Column(
        Integer, default=0, server_default="0", nullable=False
    )
    login_cooldown_until = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    linked_accounts = relationship(
        "LinkedAccount", back_populates="user", cascade="all, delete-orphan"
    )
    transactions = relationship(
        "Transaction", back_populates="user", cascade="all, delete-orphan"
    )
    analysis_results = relationship(
        "AnalysisResult", back_populates="user", cascade="all, delete-orphan"
    )
    frozen_items = relationship(
        "FrozenItem", back_populates="user", cascade="all, delete-orphan"
    )


class LinkedAccount(Base):
    __tablename__ = "linked_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    bank_name = Column(String(100), nullable=False)
    account_id = Column(String(255), nullable=False)
    open_banking_consent_id = Column(String(255), nullable=True)
    status = Column(String(50), default="active", nullable=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    account_metadata = Column("metadata", JSON, default=dict)

    user = relationship("User", back_populates="linked_accounts")
    transactions = relationship(
        "Transaction", back_populates="account", cascade="all, delete-orphan"
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("linked_accounts.id"), nullable=True)
    transaction_id = Column(String(255), unique=True, index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="ZAR", nullable=False)
    description = Column(Text, nullable=True)
    merchant = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    counterparty = Column(String(255), nullable=True)
    direction = Column(String(20), nullable=True)
    channel = Column(String(50), nullable=True)
    transaction_data = Column(JSON, default=dict)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    user = relationship("User", back_populates="transactions")
    account = relationship("LinkedAccount", back_populates="transactions")


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    financial_health_score = Column(Integer, nullable=False)
    health_band = Column(String(20), nullable=False)
    money_leaks = Column(JSON, default=list)
    summary_plain_language = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
    transaction_count = Column(Integer, default=0, nullable=False)

    user = relationship("User", back_populates="analysis_results")


class FrozenItem(Base):
    __tablename__ = "frozen_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    leak_id = Column(String(255), nullable=True)
    transaction_id = Column(String(255), nullable=True)
    consent_id = Column(String(255), nullable=True)
    reason = Column(Text, nullable=False)
    frozen_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
    status = Column(String(50), default="frozen", nullable=False)

    user = relationship("User", back_populates="frozen_items")


class RegionalStat(Base):
    __tablename__ = "regional_stats"

    id = Column(Integer, primary_key=True, index=True)
    region = Column(String(100), nullable=False, index=True)
    metric_name = Column(String(100), nullable=False, index=True)
    value = Column(Float, nullable=False)
    period = Column(String(50), nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )


class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(64), unique=True, index=True, nullable=False)
    job_type = Column(String(100), index=True, nullable=False)
    status = Column(String(50), default="pending", index=True, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    payload = Column(JSON, default=dict, nullable=False)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(100), index=True, nullable=False)
    actor_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    target_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    event_metadata = Column("metadata", JSON, default=dict, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
