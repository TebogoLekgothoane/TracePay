"""add auth action fields

Revision ID: 0003_auth_action_fields
Revises: 0002_email_auth_hardening
Create Date: 2026-06-15 00:00:00.000000

No-op: added `email_verified_at`/`auth_token_version` to a backend-owned
`users` table that no longer exists. Supabase Auth tracks email
confirmation itself. Kept as a no-op to preserve the revision chain.
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "0003_auth_action_fields"
down_revision: Union[str, None] = "0002_email_auth_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
