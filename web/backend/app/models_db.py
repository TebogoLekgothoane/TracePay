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


class Profile(Base):
    """Read-only mapping onto Supabase's `public.profiles` table.

    This table is owned by the mobile app / Supabase project setup, not by
    this backend -- no Alembic migration here ever creates, alters, or drops
    it. Only the columns this backend actually reads (or, for
    `reward_points`, legitimately writes as *data* -- redeeming a reward
    spends points the mobile app itself already writes to this same column)
    are declared; the real table has additional mobile-only columns
    (recovery_email, etc.) that are intentionally omitted.
    """

    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default="user", nullable=False)
    reward_points = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)


class AccountSettings(Base):
    """TracePay-owned account metadata (currently just individual-vs-business).

    Unlike `Profile`, this table IS created/altered by this repo's Alembic
    migrations -- it holds settings that are this app's concern, not
    Supabase's, so there's no ownership boundary to respect here.
    """

    __tablename__ = "account_settings"

    user_id = Column(UUID(as_uuid=True), primary_key=True)
    account_type = Column(String(20), default="individual", nullable=False)
    business_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class Partner(Base):
    """A commission partner (Shoprite, Checkers, etc).

    `id` is a stable string code matching mobile/src/constants/partners.ts's
    existing hardcoded ids, not a generated integer -- both the mobile
    display data and the backend's redemption records refer to the same
    partner by the same key. `estimated_value_rand` is a placeholder
    assumed redemption value used for commission calculation, not a real
    negotiated figure.
    """

    __tablename__ = "partners"

    id = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False)
    offer_description = Column(String(255), nullable=False)
    points_cost = Column(Integer, nullable=False)
    estimated_value_rand = Column(Float, nullable=False)
    commission_rate = Column(Float, default=0.025, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    owner_user_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class Redemption(Base):
    """A single user's redemption of a partner offer.

    `commission_amount` is a snapshot computed at redemption time (rate *
    value at that moment), so a later change to the partner's commission
    rate never retroactively alters historical commission owed.
    """

    __tablename__ = "redemptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    partner_id = Column(String(50), ForeignKey("partners.id"), nullable=False, index=True)
    points_spent = Column(Integer, nullable=False)
    commission_amount = Column(Float, nullable=False)
    status = Column(String(20), default="completed", nullable=False)
    redeemed_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    partner = relationship("Partner")


# The six models below store `user_id`/`actor_user_id`/`target_user_id` as
# plain UUID columns with no foreign key constraint. There is no
# backend-owned `users` table -- identity lives in Supabase's `auth.users`
# (a separate schema this repo's Alembic doesn't manage) and `profiles`
# (owned by the mobile app, see `Profile` above). Adding a DB-level FK to
# either would give this repo's migrations authority over a table they
# don't create, which has already caused one historical inconsistency
# (dangling FKs to a `users` table that no longer exists).


class LinkedAccount(Base):
    __tablename__ = "linked_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    bank_name = Column(String(100), nullable=False)
    account_id = Column(String(255), nullable=False)
    open_banking_consent_id = Column(String(255), nullable=True)
    status = Column(String(50), default="active", nullable=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    account_metadata = Column("metadata", JSON, default=dict)

    transactions = relationship(
        "Transaction", back_populates="account", cascade="all, delete-orphan"
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
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

    account = relationship("LinkedAccount", back_populates="transactions")


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    financial_health_score = Column(Integer, nullable=False)
    health_band = Column(String(20), nullable=False)
    money_leaks = Column(JSON, default=list)
    summary_plain_language = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
    transaction_count = Column(Integer, default=0, nullable=False)


class FrozenItem(Base):
    __tablename__ = "frozen_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    leak_id = Column(String(255), nullable=True)
    transaction_id = Column(String(255), nullable=True)
    consent_id = Column(String(255), nullable=True)
    reason = Column(Text, nullable=False)
    frozen_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
    status = Column(String(50), default="frozen", nullable=False)


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
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
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
    actor_user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    target_user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    event_metadata = Column("metadata", JSON, default=dict, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
