"""drop legacy users table

Revision ID: 0008_drop_legacy_users_table
Revises: 0007_audit_logs
Create Date: 2026-07-28 00:00:00.000000

Identity now lives entirely in Supabase Auth + the mobile app's `profiles`
table -- this backend no longer owns a `users` table (see app/auth.py and
app/models_db.py's `Profile` model). This migration is purely cleanup for
any environment (e.g. a stale local dev DB) that still has the old table
from before this change; it's a no-op everywhere else, including the
shared Supabase database, which never had it in the first place.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


revision: str = "0008_drop_legacy_users_table"
down_revision: Union[str, None] = "0007_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("users"):
        op.drop_table("users")


def downgrade() -> None:
    # Deliberately irreversible -- the old `users` schema (password hashes,
    # lockout fields, etc.) is gone from the codebase, so there's nothing
    # meaningful to recreate.
    pass
