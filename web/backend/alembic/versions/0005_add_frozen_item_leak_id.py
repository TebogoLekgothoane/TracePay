"""add frozen item leak id

Revision ID: 0005_frozen_item_leak_id
Revises: 0004_login_lockout_fields
Create Date: 2026-06-15 00:00:00.000002

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "0005_frozen_item_leak_id"
down_revision: Union[str, None] = "0004_login_lockout_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    frozen_item_columns = {column["name"] for column in inspector.get_columns("frozen_items")}

    if "leak_id" not in frozen_item_columns:
        op.add_column("frozen_items", sa.Column("leak_id", sa.String(length=255), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    frozen_item_columns = {column["name"] for column in inspector.get_columns("frozen_items")}

    if "leak_id" in frozen_item_columns:
        op.drop_column("frozen_items", "leak_id")
