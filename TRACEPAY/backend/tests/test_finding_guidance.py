"""Finding guidance and append-only user responses."""

from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.finding_actions import FindingActionRequest, _save
from leak_intelligence.finding_diff import RegistryRow, RegistryScopeError
from leak_intelligence.finding_guidance import (
    ACTION_TYPES,
    FindingAction,
    InvalidActionNote,
    InvalidActionType,
    action_insert_payload,
    build_guidance,
    record_user_action,
    sanitise_note,
)

USER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
FINDING_ID = "33333333-3333-4333-8333-333333333333"
WHEN = datetime(2026, 10, 10, 18, 0, tzinfo=timezone.utc)
LATER = datetime(2026, 10, 10, 19, 0, tzinfo=timezone.utc)
MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "202610100005_finding_actions.sql"
)
ACTIONS_SOURCE = Path(__file__).resolve().parents[1] / "app" / "finding_actions.py"
MOBILE_API = (
    Path(__file__).resolve().parents[2]
    / "mobile"
    / "src"
    / "features"
    / "guidance"
    / "finding-guidance.api.ts"
)


def test_each_supported_action_type_is_appended() -> None:
    finding = _row()
    history: tuple[FindingAction, ...] = ()
    for index, action_type in enumerate(sorted(ACTION_TYPES)):
        finding, history = record_user_action(
            finding,
            history,
            actor_user_id=USER,
            action_type=action_type,
            note=None,
            created_at=WHEN.replace(minute=index),
            action_id=f"action-{index}",
        )
    assert [action.action_type for action in history] == sorted(ACTION_TYPES)
    assert finding.status == "open"


@pytest.mark.parametrize("action_type", ["resolved", "saved", "closed", "Reviewed", ""])
def test_invalid_action_types_are_rejected(action_type: str) -> None:
    with pytest.raises(InvalidActionType):
        record_user_action(
            _row(),
            (),
            actor_user_id=USER,
            action_type=action_type,
            note=None,
            created_at=WHEN,
            action_id="action-1",
        )


def test_other_users_cannot_record_an_action() -> None:
    with pytest.raises(RegistryScopeError):
        record_user_action(
            _row(),
            (),
            actor_user_id=OTHER,
            action_type="reviewed",
            note=None,
            created_at=WHEN,
            action_id="action-1",
        )


def test_action_history_is_append_only() -> None:
    finding = _row()
    finding, first = record_user_action(
        finding,
        (),
        actor_user_id=USER,
        action_type="reviewed",
        note="Checked the merchant",
        created_at=WHEN,
        action_id="action-1",
    )
    _unchanged, second = record_user_action(
        finding,
        first,
        actor_user_id=USER,
        action_type="dismissed",
        note=None,
        created_at=LATER,
        action_id="action-2",
    )
    assert [action.action_type for action in second] == ["reviewed", "dismissed"]
    assert second[0].note == "Checked the merchant"
    assert action_insert_payload(second[1]).keys() == {
        "id",
        "user_id",
        "finding_id",
        "action_type",
        "note",
    }


def test_notes_and_evidence_are_sanitised() -> None:
    assert sanitise_note("  Checked the fee schedule  ") == "Checked the fee schedule"
    assert sanitise_note("   ") is None
    with pytest.raises(InvalidActionNote):
        sanitise_note("card 4111111111111111")
    with pytest.raises(InvalidActionNote):
        sanitise_note("x" * 281)

    guidance = build_guidance(
        _row(
            evidence_highlights=(
                ("merchant_display_name", "Merchant", "WOOLWORTHS"),
                ("description", "Description", "CARD 4111111111111111 PURCHASE"),
                ("account_number", "Account", "123456789012"),
            )
        )
    )
    rendered = " ".join(value for _label, value in guidance.evidence)
    assert "WOOLWORTHS" in rendered
    assert "4111111111111111" not in rendered
    assert "123456789012" not in rendered
    assert "PURCHASE" not in rendered


def test_guidance_for_each_finding_type() -> None:
    recurring = build_guidance(
        _row(
            evidence_highlights=(("merchant_display_name", "Merchant", "WOOLWORTHS"),),
        )
    )
    duplicate = build_guidance(
        _row(
            leak_type="duplicate_payment_leak",
            root_cause_type="potential_duplicate",
            evidence_highlights=(("matching_transaction_count", "Matches", 2),),
        )
    )
    fees = build_guidance(
        _row(
            leak_type="bank_fee_leak",
            root_cause_type="fee_accumulation",
            finding_focus="sms_banking",
            analysis_status="supported",
        )
    )
    spending = build_guidance(
        _row(
            leak_type="spending_escalation_leak",
            root_cause_type="amount_increase",
            analysis_status="supported",
            evidence_highlights=(("category_name", "Category", "Groceries"),),
        )
    )
    assert "WOOLWORTHS" in recurring.reason
    assert any("still wanted" in step for step in recurring.steps)
    assert any("contact the merchant or your bank" in step for step in recurring.steps)
    assert "Two transactions may represent a duplicate payment." in duplicate.reason
    assert any("pending or reversed" in step for step in duplicate.steps)
    assert "SMS banking fees" in fees.reason
    assert any("fee schedule" in step for step in fees.steps)
    assert "Groceries" in spending.reason
    assert "2026-07-01 to 2026-09-30" in spending.reason
    assert any("underlying transactions" in step for step in spending.steps)
    for guidance in (recurring, duplicate, fees, spending):
        _assert_no_claim(guidance.steps)


def test_unknown_or_insufficient_evidence_is_review_only() -> None:
    insufficient = build_guidance(
        _row(
            leak_type="duplicate_payment_leak",
            root_cause_type="unknown",
            analysis_status="insufficient_evidence",
        )
    )
    other = build_guidance(
        _row(
            leak_type="future_pattern",
            root_cause_type="transaction_pattern",
            analysis_status="supported",
        )
    )
    assert insufficient.reason == "There is not enough evidence for a specific recommendation."
    assert other.reason == "This finding does not have a specific supported next step."
    for guidance in (insufficient, other):
        assert guidance.steps[0] == "Review this finding only."
        assert any("More statement history" in step for step in guidance.steps)
        assert not any("pending or reversed" in step for step in guidance.steps)
        _assert_no_claim(guidance.steps)


def test_user_actions_do_not_change_detection_status() -> None:
    open_finding = _row(status="open", signature_generation=3, material_signature="sig-open")
    kept, history = record_user_action(
        open_finding,
        (),
        actor_user_id=USER,
        action_type="dismissed",
        note=None,
        created_at=WHEN,
        action_id="action-1",
    )
    assert kept is open_finding
    assert kept.status == "open"
    assert kept.signature_generation == 3
    assert kept.material_signature == "sig-open"
    guidance = build_guidance(kept, history)
    assert guidance.detection_status == "open"
    assert guidance.user_response == "dismissed"
    assert any("does not make the detector classify it as resolved" in line for line in guidance.uncertain)

    absent = _row(status="not_observed", last_absent_at=LATER)
    absent_guidance = build_guidance(absent, ())
    assert absent_guidance.detection_status == "not_observed"
    assert any("not marked resolved" in line for line in absent_guidance.uncertain)
    still_absent, _actions = record_user_action(
        absent,
        (),
        actor_user_id=USER,
        action_type="steps_completed",
        note=None,
        created_at=LATER,
        action_id="action-2",
    )
    completed = build_guidance(still_absent, _actions)
    assert still_absent.status == "not_observed"
    assert completed.user_response == "steps_completed"
    assert any("does not mean money was saved or recovered" in line for line in completed.uncertain)


def test_service_keeps_history_and_refuses_other_owners() -> None:
    finding = _row()
    store: list[FindingAction] = []

    def load_finding(user_id: str, _token: str, finding_id: str) -> RegistryRow | None:
        if user_id != finding.user_id or finding_id != finding.id:
            return None
        return finding

    def load_actions(user_id: str, _token: str, finding_id: str) -> tuple[FindingAction, ...]:
        return tuple(
            action
            for action in store
            if action.user_id == user_id and action.finding_id == finding_id
        )

    def save_action(_token: str, action: FindingAction) -> FindingAction:
        store.append(action)
        return action

    first = _save(
        USER,
        "user-token",
        FINDING_ID,
        FindingActionRequest(action_type="reviewed", note="Checked the merchant"),
        created_at=WHEN,
        load_finding=load_finding,
        load_actions=load_actions,
        save_action=save_action,
    )
    second = _save(
        USER,
        "user-token",
        FINDING_ID,
        FindingActionRequest(action_type="dismissed"),
        created_at=LATER,
        load_finding=load_finding,
        load_actions=load_actions,
        save_action=save_action,
    )
    assert [action.action_type for action in second.actions] == ["reviewed", "dismissed"]
    assert first.actions[0].id == second.actions[0].id
    assert finding.status == "open"
    assert finding.signature_generation == 2

    def foreign(_user_id: str, _token: str, _finding_id: str) -> RegistryRow:
        return _row(user_id=OTHER)

    with pytest.raises(HTTPException) as other_user:
        _save(
            USER,
            "user-token",
            FINDING_ID,
            FindingActionRequest(action_type="reviewed"),
            created_at=WHEN,
            load_finding=foreign,
            load_actions=load_actions,
            save_action=save_action,
        )
    assert other_user.value.status_code == 403
    assert len(store) == 2

    with pytest.raises(HTTPException) as invalid:
        _save(
            USER,
            "user-token",
            FINDING_ID,
            FindingActionRequest(action_type="resolved"),
            created_at=WHEN,
            load_finding=load_finding,
            load_actions=load_actions,
            save_action=save_action,
        )
    assert invalid.value.status_code == 422
    assert len(store) == 2


def test_action_storage_uses_the_user_token_and_rls() -> None:
    source = ACTIONS_SOURCE.read_text(encoding="utf-8")
    mobile = MOBILE_API.read_text(encoding="utf-8")
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "_request_json" in source
    assert "action_insert_payload" in source
    assert "service_role" not in source
    assert "service_role" not in mobile
    assert "enable row level security" in sql
    assert "auth.uid()" in sql
    assert "grant select, insert on table public.finding_actions to authenticated" in sql
    assert "grant update" not in sql
    assert "grant delete" not in sql
    assert "for delete" not in sql
    assert "before delete" in sql
    assert "finding actions are append-only" in sql
    assert "references public.finding_registry" in sql
    assert "'reviewed', 'steps_completed', 'dismissed', 'not_applicable'" in sql


def _assert_no_claim(steps: tuple[str, ...]) -> None:
    text = " ".join(steps).lower()
    assert "fraud" not in text
    assert "saved" not in text
    assert "recovered" not in text
    assert "resolved" not in text
    assert "confirmed duplicate" not in text


def _row(**overrides: object) -> RegistryRow:
    values: dict[str, object] = {
        "id": FINDING_ID,
        "user_id": USER,
        "fingerprint": "a" * 32,
        "identity_key": "b" * 32,
        "leak_type": "recurring_payment_leak",
        "detector_version": "1.0",
        "account_id": None,
        "status": "open",
        "material_signature": "c" * 64,
        "signature_generation": 2,
        "finding_focus": None,
        "root_cause_type": "recurring_commitment",
        "analysis_status": "verification_required",
        "persistence": "ongoing",
        "detected_amount": Decimal("99.00"),
        "impact_kind": "observed_amount",
        "impact_label": None,
        "period_start": date(2026, 7, 1),
        "period_end": date(2026, 9, 30),
        "evidence_highlights": (),
        "first_detected_at": WHEN,
        "last_seen_at": WHEN,
        "last_absent_at": None,
        "last_statement_import_id": None,
    }
    values.update(overrides)
    return RegistryRow(**values)  # type: ignore[arg-type]
