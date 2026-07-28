"""add account_settings

Revision ID: 0009_add_account_settings
Revises: 0008_drop_legacy_users_table
Create Date: 2026-07-28 00:00:00.000000

Distinguishing an individual account from a paying business account is
TracePay's own concern, not Supabase's -- so unlike `profiles`, this table
is created and owned entirely by this repo's migrations. `user_id` is a
plain UUID (matching the pattern established in 0001/0008: no FK to a
table this repo doesn't create).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "0009_add_account_settings"
down_revision: Union[str, None] = "0008_drop_legacy_users_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("account_settings"):
        return

    op.create_table(
        "account_settings",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "account_type",
            sa.String(length=20),
            nullable=False,
            server_default="individual",
        ),
        sa.Column("business_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("account_settings"):
        op.drop_table("account_settings")
