"""initial schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-06-11 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("username", sa.String(length=255), nullable=True),
            sa.Column("full_name", sa.String(length=255), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("password_hash", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("role", sa.String(length=50), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
        )
        op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
        op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)

    if not inspector.has_table("linked_accounts"):
        op.create_table(
            "linked_accounts",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("bank_name", sa.String(length=100), nullable=False),
            sa.Column("account_id", sa.String(length=255), nullable=False),
            sa.Column("open_banking_consent_id", sa.String(length=255), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        )
        op.create_index(op.f("ix_linked_accounts_id"), "linked_accounts", ["id"], unique=False)

    if not inspector.has_table("transactions"):
        op.create_table(
            "transactions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("account_id", sa.Integer(), nullable=True),
            sa.Column("transaction_id", sa.String(length=255), nullable=False),
            sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(length=10), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("merchant", sa.String(length=255), nullable=True),
            sa.Column("category", sa.String(length=100), nullable=True),
            sa.Column("counterparty", sa.String(length=255), nullable=True),
            sa.Column("direction", sa.String(length=20), nullable=True),
            sa.Column("channel", sa.String(length=50), nullable=True),
            sa.Column("transaction_data", sa.JSON(), nullable=True),
            sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["account_id"], ["linked_accounts.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        )
        op.create_index(op.f("ix_transactions_id"), "transactions", ["id"], unique=False)
        op.create_index(op.f("ix_transactions_timestamp"), "transactions", ["timestamp"], unique=False)
        op.create_index(op.f("ix_transactions_transaction_id"), "transactions", ["transaction_id"], unique=True)

    if not inspector.has_table("analysis_results"):
        op.create_table(
            "analysis_results",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("financial_health_score", sa.Integer(), nullable=False),
            sa.Column("health_band", sa.String(length=20), nullable=False),
            sa.Column("money_leaks", sa.JSON(), nullable=True),
            sa.Column("summary_plain_language", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("transaction_count", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        )
        op.create_index(op.f("ix_analysis_results_created_at"), "analysis_results", ["created_at"], unique=False)
        op.create_index(op.f("ix_analysis_results_id"), "analysis_results", ["id"], unique=False)

    if not inspector.has_table("frozen_items"):
        op.create_table(
            "frozen_items",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("transaction_id", sa.String(length=255), nullable=True),
            sa.Column("consent_id", sa.String(length=255), nullable=True),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("frozen_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        )
        op.create_index(op.f("ix_frozen_items_frozen_at"), "frozen_items", ["frozen_at"], unique=False)
        op.create_index(op.f("ix_frozen_items_id"), "frozen_items", ["id"], unique=False)

    if not inspector.has_table("regional_stats"):
        op.create_table(
            "regional_stats",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("region", sa.String(length=100), nullable=False),
            sa.Column("metric_name", sa.String(length=100), nullable=False),
            sa.Column("value", sa.Float(), nullable=False),
            sa.Column("period", sa.String(length=50), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(op.f("ix_regional_stats_id"), "regional_stats", ["id"], unique=False)
        op.create_index(op.f("ix_regional_stats_metric_name"), "regional_stats", ["metric_name"], unique=False)
        op.create_index(op.f("ix_regional_stats_region"), "regional_stats", ["region"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_regional_stats_region"), table_name="regional_stats")
    op.drop_index(op.f("ix_regional_stats_metric_name"), table_name="regional_stats")
    op.drop_index(op.f("ix_regional_stats_id"), table_name="regional_stats")
    op.drop_table("regional_stats")

    op.drop_index(op.f("ix_frozen_items_id"), table_name="frozen_items")
    op.drop_index(op.f("ix_frozen_items_frozen_at"), table_name="frozen_items")
    op.drop_table("frozen_items")

    op.drop_index(op.f("ix_analysis_results_id"), table_name="analysis_results")
    op.drop_index(op.f("ix_analysis_results_created_at"), table_name="analysis_results")
    op.drop_table("analysis_results")

    op.drop_index(op.f("ix_transactions_transaction_id"), table_name="transactions")
    op.drop_index(op.f("ix_transactions_timestamp"), table_name="transactions")
    op.drop_index(op.f("ix_transactions_id"), table_name="transactions")
    op.drop_table("transactions")

    op.drop_index(op.f("ix_linked_accounts_id"), table_name="linked_accounts")
    op.drop_table("linked_accounts")

    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
