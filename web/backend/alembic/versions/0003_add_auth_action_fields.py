"""add auth action fields

Revision ID: 0003_auth_action_fields
Revises: 0002_email_auth_hardening
Create Date: 2026-06-15 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "0003_auth_action_fields"
down_revision: Union[str, None] = "0002_email_auth_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}

    if "email_verified_at" not in user_columns:
        op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    if "auth_token_version" not in user_columns:
        op.add_column(
            "users",
            sa.Column("auth_token_version", sa.Integer(), server_default="0", nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}

    if "auth_token_version" in user_columns:
        op.drop_column("users", "auth_token_version")
    if "email_verified_at" in user_columns:
        op.drop_column("users", "email_verified_at")
