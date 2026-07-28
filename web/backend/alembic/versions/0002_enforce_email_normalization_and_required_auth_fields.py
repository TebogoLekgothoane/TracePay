"""enforce email normalization and required auth fields

Revision ID: 0002_email_auth_hardening
Revises: 0001_initial_schema
Create Date: 2026-06-11 00:00:00.000001

No-op: this migration hardened a backend-owned `users` table (email
normalization, unique index, required password hash) that no longer exists.
Identity now lives in Supabase Auth + the mobile app's `profiles` table.
Kept as a no-op, rather than deleted, to preserve the revision chain for
any environment that already has migrations applied up to this point.
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "0002_email_auth_hardening"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
