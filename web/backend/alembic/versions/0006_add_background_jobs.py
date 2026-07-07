"""add background jobs

Revision ID: 0006_background_jobs
Revises: 0005_frozen_item_leak_id
Create Date: 2026-06-15 00:00:00.000003

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "0006_background_jobs"
down_revision: Union[str, None] = "0005_frozen_item_leak_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("background_jobs"):
        return

    op.create_table(
        "background_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("job_type", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="pending"),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("ix_background_jobs_id", "background_jobs", ["id"], unique=False)
    op.create_index("ix_background_jobs_job_id", "background_jobs", ["job_id"], unique=True)
    op.create_index("ix_background_jobs_job_type", "background_jobs", ["job_type"], unique=False)
    op.create_index("ix_background_jobs_status", "background_jobs", ["status"], unique=False)
    op.create_index("ix_background_jobs_created_at", "background_jobs", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("background_jobs"):
        op.drop_index("ix_background_jobs_created_at", table_name="background_jobs")
        op.drop_index("ix_background_jobs_status", table_name="background_jobs")
        op.drop_index("ix_background_jobs_job_type", table_name="background_jobs")
        op.drop_index("ix_background_jobs_job_id", table_name="background_jobs")
        op.drop_index("ix_background_jobs_id", table_name="background_jobs")
        op.drop_table("background_jobs")
