"""add business_memberships

Revision ID: 0012_business_memberships
Revises: 0011_add_branch_label
Create Date: 2026-07-29 00:00:00.000000

Lets a business account owner invite staff to view the same business
dashboard. `member_user_id` is unique -- a person belongs to at most one
business at a time. No FK to `profiles`/`auth.users` (this repo's migrations
never constrain against Supabase-owned tables), matching the pattern
established for every other business/user_id column in this schema.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "0012_business_memberships"
down_revision: Union[str, None] = "0011_add_branch_label"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("business_memberships"):
        return

    op.create_table(
        "business_memberships",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("member_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invited_email", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_business_memberships_owner_user_id", "business_memberships", ["owner_user_id"]
    )
    op.create_index(
        "ix_business_memberships_member_user_id",
        "business_memberships",
        ["member_user_id"],
        unique=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("business_memberships"):
        op.drop_index("ix_business_memberships_member_user_id", table_name="business_memberships")
        op.drop_index("ix_business_memberships_owner_user_id", table_name="business_memberships")
        op.drop_table("business_memberships")
