"""In-app notifications created from finding-registry observations."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from leak_intelligence.finding_diff import (
    RegistryScopeError,
    build_observation,
    plan_registry_changes,
)
from leak_intelligence.finding_notifications import (
    assign_finding_ids,
    mark_notification_read,
    notification_dedupe_key,
    notifications_for_plan,
)
from leak_intelligence.intelligence_report import EvidenceHighlight
from tests.test_finding_registry import (
    IMPORT_ID,
    LATER,
    OTHER,
    USER,
    WHEN,
    _Memory,
    _finding,
    _intelligence,
    _leak,
    _processed,
    _reconcile,
)

LATER_IMPORT = "55555555-5555-4555-8555-555555555555"
MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "202610100004_finding_notifications.sql"
)


def _planned(leak=None, finding=None, existing=(), import_id=IMPORT_ID, when=WHEN):
    leak = _leak() if leak is None else leak
    finding = _finding(leak) if finding is None else finding
    observation = build_observation(user_id=USER, leak=leak, finding=finding)
    return assign_finding_ids(
        plan_registry_changes(
            user_id=USER,
            existing=existing,
            observations=[observation],
            statement_import_id=import_id,
            observed_at=when,
        )
    )


def test_new_finding_creates_one_in_app_notification() -> None:
    plan = _planned()
    notices = notifications_for_plan(plan, user_id=USER, observed_at=WHEN)
    assert len(notices) == 1
    notice = notices[0]
    assert notice.channel == "in_app"
    assert notice.delivery_status == "created"
    assert notice.read_at is None
    assert notice.finding_id == plan.writes[0].id
    assert notice.dedupe_key == notification_dedupe_key(plan.writes[0].identity_key, 1)
    assert notice.user_id == USER


def test_material_change_creates_a_separate_notification() -> None:
    stored = _planned().writes[0]
    changed_leak = _leak(
        evidence={
            "finding_focus": "interest_charges",
            "interest_charge_total": Decimal("240.00"),
            "completed_month_count": 3,
        }
    )
    changed = _planned(
        leak=changed_leak,
        finding=_finding(changed_leak),
        existing=(stored,),
        import_id=LATER_IMPORT,
        when=LATER,
    )
    first = notifications_for_plan(_planned(), user_id=USER, observed_at=WHEN)
    second = notifications_for_plan(changed, user_id=USER, observed_at=LATER)
    assert changed.items[0].classification == "materially_changed"
    assert second[0].dedupe_key != first[0].dedupe_key
    assert second[0].dedupe_key.endswith(":2")
    assert "changed" in second[0].title


def test_unchanged_finding_does_not_create_a_notification() -> None:
    stored = _planned().writes[0]
    follow_up = _planned(existing=(stored,), import_id=LATER_IMPORT, when=LATER)
    assert follow_up.items[0].classification == "unchanged"
    assert notifications_for_plan(follow_up, user_id=USER, observed_at=LATER) == ()


def test_reprocessing_the_same_import_does_not_duplicate_notifications() -> None:
    memory = _Memory()
    leak = _leak()
    finding = _finding(leak)
    record = _processed()
    _reconcile(memory, lambda user_id: _intelligence(leak, finding, user_id), record, WHEN)
    _reconcile(memory, lambda user_id: _intelligence(leak, finding, user_id), record, LATER)
    assert len(memory.notifications) == 1
    assert memory.notification_saves == 2
    saved = next(iter(memory.notifications.values()))
    assert saved.dedupe_key.endswith(":1")  # type: ignore[attr-defined]
    assert saved.delivery_status == "created"  # type: ignore[attr-defined]


def test_mark_read_is_scoped_to_the_notification_owner() -> None:
    notice = notifications_for_plan(_planned(), user_id=USER, observed_at=WHEN)[0]
    read_at = datetime(2026, 10, 10, 20, 0, tzinfo=timezone.utc)
    read = mark_notification_read(notice, actor_user_id=USER, read_at=read_at)
    assert read.delivery_status == "read"
    assert read.read_at == read_at
    assert read.title == notice.title
    assert read.dedupe_key == notice.dedupe_key
    again = mark_notification_read(read, actor_user_id=USER, read_at=LATER)
    assert again.read_at == read_at
    with pytest.raises(RegistryScopeError):
        mark_notification_read(notice, actor_user_id=OTHER, read_at=read_at)


def test_notifications_stay_with_their_user() -> None:
    plan = _planned()
    with pytest.raises(RegistryScopeError):
        notifications_for_plan(plan, user_id=OTHER, observed_at=WHEN)
    own = notifications_for_plan(plan, user_id=USER, observed_at=WHEN)[0]
    assert own.user_id == USER
    assert OTHER not in own.dedupe_key


def test_notification_copy_drops_sensitive_evidence() -> None:
    leak = _leak(
        leak_type="duplicate_payment_leak",
        evidence={
            "finding_focus": "duplicate_merchant_payment",
            "candidate_amount": Decimal("50.00"),
            "observed_date": "2026-07-01",
            "merchant_key": "WOOLWORTHS",
        },
    )
    finding = _finding(
        leak,
        leak_type="duplicate_payment_leak",
        root_cause_type="potential_duplicate",
        evidence_highlights=[
            EvidenceHighlight(key="merchant_key", label="Merchant", value="WOOLWORTHS"),
            EvidenceHighlight(
                key="description",
                label="Description",
                value="CARD 4111111111111111 PURCHASE AT SHELL",
            ),
            EvidenceHighlight(key="merchant_key", label="Merchant", value="4111111111111111"),
        ],
    )
    # The second merchant highlight is rejected by report sanitising before the notice.
    notice = notifications_for_plan(
        _planned(leak=leak, finding=finding),
        user_id=USER,
        observed_at=WHEN,
    )[0]
    combined = f"{notice.title} {notice.body}"
    assert "4111111111111111" not in combined
    assert "PURCHASE AT SHELL" not in combined
    assert "confirmed duplicate" not in combined.lower()
    assert "guaranteed recovery" not in combined.lower()
    assert "you saved" not in combined.lower()
    assert "not money already saved" in notice.body
    assert "WOOLWORTHS" in notice.body


def test_notification_migration_is_owner_scoped() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "unique (user_id, dedupe_key)" in sql
    assert "channel = 'in_app'" in sql
    assert "'created', 'read'" in sql or "'created', 'read'" in sql.replace("\n", " ")
    assert "enable row level security" in sql
    assert "auth.uid()" in sql
    assert "finding notifications select own" in sql
    assert "finding notifications update own" in sql
    assert "for delete" not in sql
    assert "service_role" not in sql
    assert "references public.finding_registry" in sql
