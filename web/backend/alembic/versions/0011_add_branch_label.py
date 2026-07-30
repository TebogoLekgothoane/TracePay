"""add branch_label to linked_accounts

Revision ID: 0011_add_branch_label
Revises: 0010_partners_redemptions
Create Date: 2026-07-29 00:00:00.000000

Lets a business tag which branch/department a linked account belongs to,
for the branch rollup on the business dashboard. Nullable and untouched for
individual accounts.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "0011_add_branch_label"
down_revision: Union[str, None] = "0010_partners_redemptions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("linked_accounts")}
    if "branch_label" not in columns:
        op.add_column(
            "linked_accounts", sa.Column("branch_label", sa.String(length=100), nullable=True)
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("linked_accounts")}
    if "branch_label" in columns:
        op.drop_column("linked_accounts", "branch_label")
