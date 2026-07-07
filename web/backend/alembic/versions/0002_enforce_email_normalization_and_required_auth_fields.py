"""enforce email normalization and required auth fields

Revision ID: 0002_email_auth_hardening
Revises: 0001_initial_schema
Create Date: 2026-06-11 00:00:00.000001

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from passlib.context import CryptContext


# revision identifiers, used by Alembic.
revision: str = "0002_email_auth_hardening"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def upgrade() -> None:
    op.execute(sa.text("UPDATE users SET email = lower(trim(email)) WHERE email IS NOT NULL"))
    op.execute(sa.text("UPDATE users SET email = concat('legacy-', id::text, '@invalid.local') WHERE email IS NULL"))
    placeholder_hash = pwd_context.hash("legacy-password-placeholder")
    op.execute(
        sa.text("UPDATE users SET password_hash = :password_hash WHERE password_hash IS NULL").bindparams(
            password_hash=placeholder_hash
        )
    )

    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=False)
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=False)

    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_email"))
    op.execute(sa.text("CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email))"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS uq_users_email_lower"))
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=True)
    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=True)
