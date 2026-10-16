"""In-app notification drafts for finding-registry observations.

Unchanged findings do not create a notice. Replays reuse the same dedupe key.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import datetime
from uuid import uuid4

from leak_intelligence.finding_diff import (
    RegistryCompositionError,
    RegistryPlan,
    RegistryScopeError,
)
from leak_intelligence.merchant_display import (
    display_merchant_label,
    is_reliable_merchant_display_name,
    merchant_display_name_for,
)

_LONG_DIGITS = re.compile(r"\d{6,}")
_SAFE_MERCHANT = re.compile(r"^[A-Za-z][A-Za-z0-9 &'.,-]{0,39}$")
_LABELS = {
    "duplicate_payment_leak": "Potential duplicate payment",
    "subscription_leak": "Recurring subscription",
    "recurring_payment_leak": "Recurring payment",
    "unknown_recurring_payment": "Recurring payment",
    "inactive_recurring_payment_leak": "Inactive recurring payment",
    "irregular_transaction_leak": "Unusual transaction",
    "bank_fee_leak": "Bank fee pattern",
    "spending_escalation_leak": "Spending increase",
    "cash_usage_leak": "Cash withdrawal pattern",
    "airtime_data_leak": "Airtime and data spending",
    "food_spending_leak": "Food spending pattern",
    "transport_spending_leak": "Transport spending pattern",
}
_NOT_SAVED = "This is not money already saved."


@dataclass(frozen=True)
class FindingNotification:
    user_id: str
    finding_id: str
    dedupe_key: str
    channel: str
    delivery_status: str
    title: str
    body: str
    created_at: datetime
    read_at: datetime | None = None


def notification_dedupe_key(identity_key: str, signature_generation: int) -> str:
    """One key per finding identity and signature generation."""
    if signature_generation < 1:
        raise RegistryCompositionError("Signature generation must be positive.")
    return f"{identity_key}:{signature_generation}"


def assign_finding_ids(plan: RegistryPlan) -> RegistryPlan:
    """Give new findings a stable id before the registry and notifications are saved."""
    items = []
    for item in plan.items:
        row = item.row if item.row.id else replace(item.row, id=str(uuid4()))
        items.append(replace(item, row=row))
    return RegistryPlan(items=tuple(items))


def notifications_for_plan(
    plan: RegistryPlan,
    *,
    user_id: str,
    observed_at: datetime,
) -> tuple[FindingNotification, ...]:
    """Create notices for new and materially changed observations only."""
    if observed_at.tzinfo is None or observed_at.utcoffset() is None:
        raise RegistryCompositionError("observed_at must be timezone-aware.")
    drafts: list[FindingNotification] = []
    for item in plan.items:
        if item.row.user_id != user_id:
            raise RegistryScopeError("Notification belongs to a different user.")
        kind = _notify_kind(item.classification, item.write, item.row.signature_generation)
        if kind is None:
            continue
        if not item.row.id:
            raise RegistryCompositionError("A notification needs the saved finding id.")
        drafts.append(
            FindingNotification(
                user_id=user_id,
                finding_id=item.row.id,
                dedupe_key=notification_dedupe_key(
                    item.row.identity_key,
                    item.row.signature_generation,
                ),
                channel="in_app",
                delivery_status="created",
                title=_title(
                    item.row.leak_type,
                    kind,
                    item.row.evidence_highlights,
                ),
                body=_body(item.row.leak_type, item.row.evidence_highlights, kind),
                created_at=observed_at,
            )
        )
    keys = [item.dedupe_key for item in drafts]
    if len(keys) != len(set(keys)):
        raise RegistryCompositionError("Notification dedupe keys are not unique.")
    return tuple(drafts)


def mark_notification_read(
    notification: FindingNotification,
    *,
    actor_user_id: str,
    read_at: datetime,
) -> FindingNotification:
    """Mark one notice read without changing its identity or copy."""
    if notification.user_id != actor_user_id:
        raise RegistryScopeError("Notification belongs to a different user.")
    if read_at.tzinfo is None or read_at.utcoffset() is None:
        raise RegistryCompositionError("read_at must be timezone-aware.")
    if notification.delivery_status == "read":
        return notification
    return replace(notification, delivery_status="read", read_at=read_at)


def _notify_kind(classification: str, write: bool, generation: int) -> str | None:
    if classification in {"new", "materially_changed"}:
        return classification
    # Same-import replay is classified unchanged and is not written again.
    # Repeat the original generation's notice so a lost insert can be ignored.
    if classification == "unchanged" and not write:
        return "new" if generation <= 1 else "materially_changed"
    return None


def _title(
    leak_type: str,
    kind: str,
    highlights: tuple[tuple[str, str, str | int | bool], ...],
) -> str:
    merchant = _merchant(highlights)
    label = _LABELS.get(leak_type, "Spending pattern")
    if merchant:
        if leak_type == "duplicate_payment_leak":
            label = f"Possible duplicate payment at {merchant}"
        elif leak_type in {
            "subscription_leak",
            "recurring_payment_leak",
            "unknown_recurring_payment",
        }:
            label = f"{merchant} recurring payment"
        elif leak_type in {
            "spending_escalation_leak",
            "airtime_data_leak",
            "food_spending_leak",
            "transport_spending_leak",
        }:
            label = f"{merchant} spending increase"
        else:
            label = f"{merchant} — {label}"
    if kind == "materially_changed":
        title = f"{label} changed"
    else:
        title = f"{label} detected"
    return title[:120]


def _body(
    leak_type: str,
    highlights: tuple[tuple[str, str, str | int | bool], ...],
    kind: str,
) -> str:
    merchant = _merchant(highlights)
    if kind == "materially_changed":
        lead = "The evidence for this pattern changed enough to look again."
    elif leak_type == "duplicate_payment_leak":
        who = f" at {merchant}" if merchant else ""
        lead = (
            f"Payments{who} match on merchant, amount, and date. "
            "This match still needs verification; matching details do not prove a "
            "duplicate or a recoverable amount."
        )
    elif merchant:
        lead = f"A repeated pattern involving {merchant} showed up in your latest statement."
    else:
        lead = "A repeated pattern showed up in your latest statement."
    body = f"{lead} {_NOT_SAVED}"
    return body[:400]


def _merchant(
    highlights: tuple[tuple[str, str, str | int | bool], ...],
) -> str | None:
    preferred_keys = (
        "merchant_display_name",
        "merchant_name",
        "merchant",
        "merchant_key",
    )
    for preferred in preferred_keys:
        for key, _label, value in highlights:
            if key != preferred or not isinstance(value, str):
                continue
            cleaned = " ".join(value.split())
            if (
                not cleaned
                or not _SAFE_MERCHANT.fullmatch(cleaned)
                or _LONG_DIGITS.search(cleaned)
            ):
                continue
            if not is_reliable_merchant_display_name(cleaned):
                continue
            return merchant_display_name_for(cleaned) or display_merchant_label(cleaned)
    return None
