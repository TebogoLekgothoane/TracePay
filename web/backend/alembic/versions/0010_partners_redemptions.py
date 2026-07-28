"""add partners and redemptions

Revision ID: 0010_partners_redemptions
Revises: 0009_add_account_settings
Create Date: 2026-07-28 00:00:00.000000

Both tables are owned entirely by this repo (unlike `profiles`), so
`redemptions.partner_id` gets a real FK to `partners.id` -- there's no
cross-boundary concern like there is with Supabase-owned tables.

`partners.id` is a stable string code (matching the ids already hardcoded
in mobile/src/constants/partners.ts: shoprite, pnp, checkers, mrprice,
clicks, woolworths) rather than a generated integer, so the mobile app's
existing display data and the backend's redemption/commission records
refer to the same partner by the same key. Seeded here with the same six
partners and their existing points costs; `estimated_value_rand` is a
placeholder assumed redemption value for commission calculation, not a
real negotiated figure -- update it once real partner agreements exist.
"""

from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "0010_partners_redemptions"
down_revision: Union[str, None] = "0009_add_account_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SEED_PARTNERS = [
    ("shoprite", "Shoprite", "5% off groceries", 150, 200.0),
    ("pnp", "Pick n Pay", "R20 voucher", 200, 20.0),
    ("checkers", "Checkers", "3% cashback", 180, 150.0),
    ("mrprice", "Mr Price", "10% off clothing", 120, 100.0),
    ("clicks", "Clicks", "R15 off pharmacy", 100, 15.0),
    ("woolworths", "Woolworths", "8% off food", 160, 180.0),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("partners"):
        op.create_table(
            "partners",
            sa.Column("id", sa.String(length=50), primary_key=True, nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("offer_description", sa.String(length=255), nullable=False),
            sa.Column("points_cost", sa.Integer(), nullable=False),
            sa.Column("estimated_value_rand", sa.Float(), nullable=False),
            sa.Column("commission_rate", sa.Float(), nullable=False, server_default="0.025"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        partners_table = sa.table(
            "partners",
            sa.column("id", sa.String),
            sa.column("name", sa.String),
            sa.column("offer_description", sa.String),
            sa.column("points_cost", sa.Integer),
            sa.column("estimated_value_rand", sa.Float),
            sa.column("created_at", sa.DateTime),
        )
        seeded_at = datetime.utcnow()
        op.bulk_insert(
            partners_table,
            [
                {
                    "id": code,
                    "name": name,
                    "offer_description": offer,
                    "points_cost": pts,
                    "estimated_value_rand": value,
                    "created_at": seeded_at,
                }
                for code, name, offer, pts, value in _SEED_PARTNERS
            ],
        )

    if not inspector.has_table("redemptions"):
        op.create_table(
            "redemptions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("partner_id", sa.String(length=50), nullable=False),
            sa.Column("points_spent", sa.Integer(), nullable=False),
            sa.Column("commission_amount", sa.Float(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="completed"),
            sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["partner_id"], ["partners.id"]),
        )
        op.create_index("ix_redemptions_user_id", "redemptions", ["user_id"], unique=False)
        op.create_index("ix_redemptions_partner_id", "redemptions", ["partner_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("redemptions"):
        op.drop_index("ix_redemptions_partner_id", table_name="redemptions")
        op.drop_index("ix_redemptions_user_id", table_name="redemptions")
        op.drop_table("redemptions")
    if inspector.has_table("partners"):
        op.drop_table("partners")
