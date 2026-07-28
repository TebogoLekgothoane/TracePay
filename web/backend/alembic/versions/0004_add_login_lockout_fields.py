"""add login lockout fields

Revision ID: 0004_login_lockout_fields
Revises: 0003_auth_action_fields
Create Date: 2026-06-15 00:00:00.000001

No-op: added `failed_login_attempts`/`login_cooldown_until` to a
backend-owned `users` table that no longer exists. Login now happens via
Supabase Auth, which has its own rate limiting. Kept as a no-op to
preserve the revision chain.
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "0004_login_lockout_fields"
down_revision: Union[str, None] = "0003_auth_action_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
