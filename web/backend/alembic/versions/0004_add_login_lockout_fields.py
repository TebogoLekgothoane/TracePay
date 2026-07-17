"""add login lockout fields

Revision ID: 0004_login_lockout_fields
Revises: 0003_auth_action_fields
Create Date: 2026-06-15 00:00:00.000001

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "0004_login_lockout_fields"
down_revision: Union[str, None] = "0003_auth_action_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}

    if "failed_login_attempts" not in user_columns:
        op.add_column(
            "users",
            sa.Column("failed_login_attempts", sa.Integer(), server_default="0", nullable=False),
        )
    if "login_cooldown_until" not in user_columns:
        op.add_column("users", sa.Column("login_cooldown_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}

    if "login_cooldown_until" in user_columns:
        op.drop_column("users", "login_cooldown_until")
    if "failed_login_attempts" in user_columns:
        op.drop_column("users", "failed_login_attempts")
