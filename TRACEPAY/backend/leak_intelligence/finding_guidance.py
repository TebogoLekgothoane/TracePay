"""Practical guidance and append-only user responses for one stored finding.

Detection status stays on the registry row. A user response never rewrites it,
and completing steps is not treated as money saved or recovered.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import datetime
from decimal import Decimal
from typing import Sequence

from leak_intelligence.finding_diff import (
    RegistryCompositionError,
    RegistryRow,
    RegistryScopeError,
)
from leak_intelligence.finding_outcomes import FindingOutcomeCheck
from leak_intelligence.merchant_display import (
    display_merchant_label,
    is_reliable_merchant_display_name,
    merchant_display_name_for,
)

ACTION_TYPES = frozenset(
    {"reviewed", "steps_completed", "dismissed", "not_applicable"}
)
USAGE_ANSWERS = frozenset(
    {"frequently", "sometimes", "rarely", "never", "not_sure"}
)
NOTE_LIMIT = 280

_LONG_DIGITS = re.compile(r"\d{6,}")
_SAFE_LABEL = re.compile(r"^[A-Za-z][A-Za-z0-9 &'.,-]{0,39}$")
_FORBIDDEN_KEYS = frozenset(
    {
        "description",
        "account",
        "account_number",
        "body",
        "raw",
        "reference",
        "transaction_ids",
    }
)
_RECURRING = frozenset(
    {
        "subscription_leak",
        "recurring_payment_leak",
        "unknown_recurring_payment",
        "inactive_recurring_payment_leak",
    }
)
_SPENDING = frozenset(
    {
        "spending_escalation_leak",
        "cash_usage_leak",
        "airtime_data_leak",
        "food_spending_leak",
        "transport_spending_leak",
    }
)
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
_STATUS_LABELS = {
    "open": "Open",
    "explained": "Explained",
    "action_recorded": "Action recorded",
    "monitoring": "Monitoring",
    "dismissed": "Dismissed",
    "not_observed": "Not in the latest report",
}
_FEE_FOCUS = {
    "sms_banking": "SMS banking fees",
    "atm_balance_enquiry": "ATM balance enquiry fees",
    "immediate_payment_fee": "immediate payment fees",
    "foreign_transaction_fee": "foreign transaction fees",
    "interest_charges": "interest charges",
    "overdraft_fee_pattern": "overdraft fees",
    "insufficient_funds_charges": "insufficient funds charges",
    "recurring_merchant_fee_change": "a recurring merchant fee change",
    "monthly_banking_fee_trend": "the monthly banking fee trend",
    "atm_withdrawal_fee_stacking": "ATM withdrawal fee stacking",
}
_SPENDING_FOCUS = {
    "airtime_inefficiency": "Airtime",
    "data_inefficiency": "Data",
    "ride_hailing_dependency": "Ride hailing",
    "food_delivery_dependency": "Food delivery",
    "cash_dependency": "Cash withdrawals",
    "subscription_review": "Subscriptions",
    "debit_order_review": "Debit orders",
    "repeated_payments_detected": "Repeated payments",
}
_ANALYSIS = {
    "supported": (
        "The stored analysis supports a pattern. It does not confirm an error or a recovery."
    ),
    "verification_required": "This pattern still needs verification.",
    "insufficient_evidence": "The available history is not enough to explain the pattern.",
    "competing_explanations": "More than one explanation is still possible.",
}


class InvalidActionType(ValueError):
    """The action is outside the supported user responses."""


class InvalidActionNote(ValueError):
    """The note is too long or contains a long number."""


@dataclass(frozen=True)
class FindingAction:
    user_id: str
    finding_id: str
    action_type: str
    note: str | None
    created_at: datetime
    id: str | None = None


@dataclass(frozen=True)
class FindingGuidance:
    finding_id: str
    title: str
    detection_status: str
    detection_status_label: str
    user_response: str | None
    source: str | None
    what_happened: str
    reason: str
    evidence: tuple[tuple[str, str], ...]
    known: tuple[str, ...]
    uncertain: tuple[str, ...]
    steps: tuple[str, ...]
    actions: tuple[FindingAction, ...]
    outcome_checks: tuple[FindingOutcomeCheck, ...] = ()
    usage_answer: str | None = None


def sanitise_note(note: str | None) -> str | None:
    """Collapse whitespace and reject long numbers or notes past the limit."""
    if note is None:
        return None
    if not isinstance(note, str):
        raise InvalidActionNote("Note must be text.")
    cleaned = " ".join(note.split())
    if not cleaned:
        return None
    if len(cleaned) > NOTE_LIMIT or _LONG_DIGITS.search(cleaned):
        raise InvalidActionNote("Note cannot include long numbers and must stay short.")
    return cleaned


def action_insert_payload(action: FindingAction) -> dict[str, str | None]:
    """Fields written for one new response. Detection status is not included."""
    if action.id is None:
        raise RegistryCompositionError("Action id is required.")
    if action.action_type not in ACTION_TYPES:
        raise InvalidActionType("Action type is not supported.")
    return {
        "id": action.id,
        "user_id": action.user_id,
        "finding_id": action.finding_id,
        "action_type": action.action_type,
        "note": action.note,
    }


def record_user_action(
    finding: RegistryRow,
    history: Sequence[FindingAction],
    *,
    actor_user_id: str,
    action_type: str,
    note: str | None,
    created_at: datetime,
    action_id: str,
) -> tuple[RegistryRow, tuple[FindingAction, ...]]:
    """Append one response and return the finding unchanged."""
    if finding.id is None:
        raise RegistryCompositionError("Finding id is required.")
    if finding.user_id != actor_user_id:
        raise RegistryScopeError("Finding belongs to a different user.")
    if created_at.tzinfo is None or created_at.utcoffset() is None:
        raise RegistryCompositionError("created_at must be timezone-aware.")
    if action_type not in ACTION_TYPES:
        raise InvalidActionType("Action type is not supported.")
    action = FindingAction(
        id=action_id,
        user_id=actor_user_id,
        finding_id=finding.id,
        action_type=action_type,
        note=sanitise_note(note),
        created_at=created_at,
    )
    recorded = _owned_actions(finding, tuple(history) + (action,))
    return finding, recorded


def build_guidance(
    finding: RegistryRow,
    history: Sequence[FindingAction] = (),
    *,
    usage_answer: str | None = None,
) -> FindingGuidance:
    """Guidance from stored finding fields. This does not rerun detection."""
    if finding.id is None:
        raise RegistryCompositionError("Finding id is required.")
    actions = _owned_actions(finding, history)
    kind = _kind(finding)
    values = _highlight_map(finding)
    merchant = _merchant_label(values)
    category = _named(values, ("category_name", "category")) or _SPENDING_FOCUS.get(
        finding.finding_focus or ""
    )
    fee_focus = _FEE_FOCUS.get(finding.finding_focus or "")
    period = _period(finding)
    source = _source(merchant, category, fee_focus, kind)
    valid_usage = (
        usage_answer
        if finding.leak_type == "subscription_leak" and usage_answer in USAGE_ANSWERS
        else None
    )
    title = _specific_title(kind, finding, merchant, category, fee_focus, values)
    what_happened = _what_happened(kind, finding, merchant, category, fee_focus, values)
    reason, steps = _copy(
        kind, finding, merchant, category, fee_focus, period, values, valid_usage
    )
    latest = actions[-1].action_type if actions else None
    return FindingGuidance(
        finding_id=finding.id,
        title=title,
        detection_status=finding.status,
        detection_status_label=_STATUS_LABELS.get(finding.status, "Recorded"),
        user_response=latest,
        source=source,
        what_happened=what_happened,
        reason=reason,
        evidence=_evidence(finding),
        known=_known(finding, merchant, category, fee_focus, period, source, valid_usage),
        uncertain=_uncertain(finding, kind, actions, merchant, valid_usage),
        steps=steps,
        actions=actions,
        usage_answer=valid_usage,
    )


def _owned_actions(
    finding: RegistryRow,
    history: Sequence[FindingAction],
) -> tuple[FindingAction, ...]:
    owned: list[FindingAction] = []
    for action in history:
        if action.user_id != finding.user_id or action.finding_id != finding.id:
            raise RegistryScopeError("Action belongs to a different finding.")
        if action.action_type not in ACTION_TYPES:
            raise InvalidActionType("Action type is not supported.")
        owned.append(replace(action, note=_public_note(action.note)))
    owned.sort(key=lambda item: (item.created_at, item.id or ""))
    return tuple(owned)


def _public_note(note: str | None) -> str | None:
    try:
        return sanitise_note(note)
    except InvalidActionNote:
        return None


def _kind(finding: RegistryRow) -> str:
    if (
        finding.analysis_status == "insufficient_evidence"
        or finding.root_cause_type in {"insufficient_evidence", "unknown"}
    ):
        return "insufficient"
    if finding.leak_type == "duplicate_payment_leak" or finding.root_cause_type == "potential_duplicate":
        return "duplicate"
    if finding.leak_type == "irregular_transaction_leak" or finding.finding_focus == "unusual_transaction":
        return "irregular"
    if finding.leak_type in _RECURRING or finding.root_cause_type == "recurring_commitment":
        return "recurring"
    if finding.leak_type == "bank_fee_leak" or finding.root_cause_type == "fee_accumulation":
        return "fees"
    if finding.leak_type in _SPENDING or finding.root_cause_type in {
        "frequency_increase",
        "amount_increase",
        "price_increase",
        "category_growth",
        "merchant_concentration",
        "behavioural_concentration",
    }:
        return "spending"
    return "other"


def _copy(
    kind: str,
    finding: RegistryRow,
    merchant: str | None,
    category: str | None,
    fee_focus: str | None,
    period: str | None,
    values: dict[str, str],
    usage_answer: str | None = None,
) -> tuple[str, tuple[str, ...]]:
    if kind == "insufficient":
        return (
            "There is not enough evidence for a specific recommendation.",
            (
                "Review this finding only.",
                "More statement history or verification with the merchant or bank may be needed.",
                "TracePay will not change the account, contact the bank, or stop a payment.",
            ),
        )
    if kind == "duplicate":
        count = values.get("matching_transaction_count")
        amount = values.get("potential_duplicate_amount") or values.get("candidate_amount")
        observed_date = values.get("observed_date")
        who = f" at {merchant}" if merchant else ""
        money = f" of {amount}" if amount else ""
        when = f" on {observed_date}" if observed_date else ""
        count_line = (
            "Two transactions"
            if count == "2"
            else (f"{count} transactions" if count else "Matching transactions")
        )
        return (
            (
                f"{count_line}{who}{money}{when} shared the same merchant grouping, "
                "amount and calendar day. This is a verification step only; matching "
                "details do not prove a duplicate or a recoverable amount."
            ),
            (
                "Compare the transactions and check whether one is pending or reversed.",
                (
                    "If a charge appears incorrect, contact the merchant or your bank. "
                    "TracePay will not contact the bank or dispute the payment."
                ),
            ),
        )
    if kind == "irregular":
        amount = values.get("transaction_amount") or _money(finding.detected_amount)
        who = f" at {merchant}" if merchant else ""
        cat_clause = f" in {category}" if category else ""
        when = f" on {values['transaction_date']}" if values.get("transaction_date") else ""
        return (
            (
                f"A single transaction of {amount}{who}{cat_clause}{when} was materially "
                "larger than the category baseline. This is a verification cue only and "
                "does not establish an error or unauthorised charge."
            ),
            (
                "Compare the transaction date and amount against your receipts or records.",
                (
                    "If the transaction was not authorised, contact the merchant or your "
                    "bank. TracePay will not dispute the charge or contact the bank."
                ),
            ),
        )
    if kind == "recurring":
        if (
            finding.leak_type == "inactive_recurring_payment_leak"
            or finding.finding_focus == "missing_expected_recurring_payment"
        ):
            who = f" at {merchant}" if merchant else ""
            last_date = values.get("last_observed_date")
            last_clause = f" Last observed on {last_date}." if last_date else ""
            return (
                (
                    f"A previously regular payment{who} has not appeared within its "
                    f"expected billing window.{last_clause} This is a verification step "
                    "only and does not establish that the service was cancelled."
                ),
                (
                    "Check whether the payment was delayed, billed under another description, or stopped.",
                    (
                        "If you still need the service or need to confirm its status, "
                        "contact the merchant or your bank. TracePay will not change "
                        "the payment."
                    ),
                ),
            )
        if merchant:
            lead = f"A recurring payment pattern was observed at {merchant}."
        else:
            lead = (
                "An unidentified recurring payment pattern was observed. "
                "The merchant could not be identified reliably from the available evidence."
            )
        average = values.get("average_payment") or values.get("average_amount")
        if average:
            lead = f"{lead} Average payment: {average}."
        if usage_answer in {"never", "rarely"}:
            return (
                lead,
                (
                    (
                        "You reported low or no usage for this subscription. Review "
                        "cancellation or downgrade options with the merchant or your "
                        "bank. TracePay will not stop or change the payment."
                    ),
                    (
                        "Verify the merchant and the amount. If the payment is not wanted, "
                        "contact the merchant or your bank."
                    ),
                ),
            )
        return (
            lead,
            (
                (
                    "Verify whether the recurring payment is still wanted and whether "
                    "the amount and service are still appropriate. TracePay will not "
                    "stop or change the payment."
                ),
                (
                    "Verify the merchant and the amount. If the payment is not wanted, "
                    "contact the merchant or your bank."
                ),
            ),
        )
    if kind == "fees":
        focus = f" The supported fee focus is {fee_focus}." if fee_focus else ""
        missing = "" if fee_focus else " A supported fee focus was not available."
        target = f" for {fee_focus}" if fee_focus else ""
        return (
            f"Banking fee activity was observed.{focus}{missing}",
            (
                f"Check the bank's fee schedule or ask the bank about alternatives{target}.",
                (
                    "Review the fee transactions and determine whether lower-cost account "
                    "or payment options are available. TracePay will not change the account "
                    "or contact the bank."
                ),
            ),
        )
    if kind == "spending":
        subject = merchant or category or _LABELS.get(finding.leak_type, "Spending")
        change = values.get("absolute_change") or values.get("change_amount")
        when = (
            f" The comparison period is {period}."
            if period
            else " A comparison period was not stored."
        )
        change_line = f" increased by {change}" if change else " was flagged"
        return (
            f"{subject}{change_line}.{when}",
            (
                "Review the underlying transactions.",
                _spending_follow_up(finding),
            ),
        )
    return (
        "This finding does not have a specific supported next step.",
        (
            "Review this finding only.",
            "More statement history or verification with the merchant or bank may be needed.",
            "TracePay will not change the account, contact the bank, or stop a payment.",
        ),
    )


def _spending_follow_up(finding: RegistryRow) -> str:
    if finding.leak_type == "airtime_data_leak":
        return (
            "Review how often airtime and data purchases are happening. TracePay is "
            "not assuming the spending is too high and is not recommending a specific package."
        )
    if finding.leak_type == "food_spending_leak" and finding.root_cause_type == "frequency_increase":
        return (
            "Review how often these purchases are happening and decide which ones are "
            "still wanted. TracePay is not setting a budget and has not judged individual purchases."
        )
    return (
        "Monitor whether this pattern continues relative to the comparison period. "
        "TracePay will not move money or change financial settings."
    )


def _known(
    finding: RegistryRow,
    merchant: str | None,
    category: str | None,
    fee_focus: str | None,
    period: str | None,
    source: str | None,
    usage_answer: str | None = None,
) -> tuple[str, ...]:
    known = [
        f"Finding type: {_LABELS.get(finding.leak_type, 'Finding')}.",
        f"Detection status: {_STATUS_LABELS.get(finding.status, 'Recorded')}.",
        (
            f"Detected amount: {_money(finding.detected_amount)}. "
            "This is not a savings figure."
        ),
    ]
    if source:
        known.append(f"Source: {source}.")
    if period:
        known.append(f"Comparison period: {period}.")
    if merchant:
        known.append(f"Merchant: {merchant}.")
    if category:
        known.append(f"Category: {category}.")
    if fee_focus:
        known.append(f"Supported fee focus: {fee_focus}.")
    if usage_answer:
        known.append(f"User-confirmed usage: {usage_answer.replace('_', ' ')}.")
    return tuple(known)


def _uncertain(
    finding: RegistryRow,
    kind: str,
    actions: Sequence[FindingAction],
    merchant: str | None,
    usage_answer: str | None = None,
) -> tuple[str, ...]:
    lines = [
        "Your response is stored separately and does not change detection status.",
        _ANALYSIS.get(
            finding.analysis_status,
            "The explanation is incomplete and still needs verification.",
        ),
    ]
    if finding.status == "not_observed":
        lines.append("A finding missing from a later report is not marked resolved.")
    if any(action.action_type == "dismissed" for action in actions):
        lines.append(
            "Dismissing this finding does not make the detector classify it as resolved."
        )
    if any(action.action_type == "steps_completed" for action in actions):
        lines.append("Completing steps does not mean money was saved or recovered.")
    if usage_answer:
        lines.append(
            "User-confirmed usage is recorded as review context and does not "
            "cancel the payment or establish verified savings."
        )
    if kind == "duplicate":
        lines.append(
            "Matching those fields does not establish that the amount is recoverable, "
            "and it is not recovered money."
        )
    if kind == "recurring" and not merchant:
        lines.append(
            "The merchant or recipient could not be identified reliably from the "
            "available transaction evidence."
        )
    return tuple(lines)


def _source(
    merchant: str | None,
    category: str | None,
    fee_focus: str | None,
    kind: str,
) -> str | None:
    if merchant:
        return merchant
    if fee_focus:
        return fee_focus
    if category:
        return category
    if kind == "recurring":
        return "Unidentified merchant"
    if kind == "duplicate":
        return "Unidentified merchant or recipient"
    return None


def _specific_title(
    kind: str,
    finding: RegistryRow,
    merchant: str | None,
    category: str | None,
    fee_focus: str | None,
    values: dict[str, str],
) -> str:
    amount = values.get("average_payment") or values.get("average_amount")
    duplicate_amount = values.get("potential_duplicate_amount") or values.get(
        "candidate_amount"
    )
    change = values.get("absolute_change") or values.get("change_amount")
    if kind == "duplicate":
        if merchant and duplicate_amount:
            return f"Possible duplicate payment at {merchant} — {duplicate_amount}"
        if merchant:
            return f"Possible duplicate payment at {merchant}"
        return _LABELS.get(finding.leak_type, "Potential duplicate payment")
    if kind == "irregular":
        if merchant:
            return f"Unusual transaction at {merchant}"
        if category:
            return f"Unusual transaction in {category}"
        return _LABELS.get(finding.leak_type, "Unusual transaction")
    if kind == "recurring":
        if (
            finding.leak_type == "inactive_recurring_payment_leak"
            or finding.finding_focus == "missing_expected_recurring_payment"
        ):
            if merchant:
                return f"Inactive recurring payment at {merchant}"
            return _LABELS.get(finding.leak_type, "Inactive recurring payment")
        if finding.finding_focus == "repeated_payments_detected":
            if merchant and amount:
                return f"Repeated payments detected at {merchant} — {amount} average"
            if merchant:
                return f"Repeated payments detected at {merchant}"
            return "Repeated payments detected"
        if finding.leak_type == "subscription_leak" and merchant:
            if amount:
                return f"{merchant} subscription — {amount} recurring monthly payment"
            return f"{merchant} subscription"
        if merchant and amount:
            return f"{merchant} — {amount} recurring payment"
        if merchant:
            return f"{merchant} recurring payment"
        return "Unidentified recurring payment"
    if kind == "fees":
        if fee_focus:
            return fee_focus[0].upper() + fee_focus[1:]
        return _LABELS.get(finding.leak_type, "Bank fee pattern")
    if kind == "spending":
        subject = merchant or category
        if subject and change:
            return f"{subject} spending increased by {change}"
        if subject:
            return f"{subject} spending increased"
        return _LABELS.get(finding.leak_type, "Spending increase")
    return _LABELS.get(finding.leak_type, "Finding")


def _what_happened(
    kind: str,
    finding: RegistryRow,
    merchant: str | None,
    category: str | None,
    fee_focus: str | None,
    values: dict[str, str],
) -> str:
    if kind == "duplicate":
        count = values.get("matching_transaction_count") or "matching"
        amount = values.get("potential_duplicate_amount") or values.get("candidate_amount")
        who = merchant or "an unidentified merchant or recipient"
        money = f" for {amount}" if amount else ""
        return (
            f"{count} same-day transactions at {who}{money} matched on merchant "
            "grouping, amount and date."
        )
    if kind == "irregular":
        amount = values.get("transaction_amount") or _money(finding.detected_amount)
        who = f" at {merchant}" if merchant else ""
        cat_clause = f" in {category}" if category else ""
        return (
            f"A single transaction of {amount}{who}{cat_clause} was materially "
            "above the category baseline."
        )
    if kind == "recurring":
        who = merchant or "an unidentified merchant"
        if (
            finding.leak_type == "inactive_recurring_payment_leak"
            or finding.finding_focus == "missing_expected_recurring_payment"
        ):
            return (
                f"A previously regular payment at {who} has not appeared within its "
                "expected billing window."
            )
        amount = values.get("average_payment") or values.get("average_amount")
        money = f" averaging {amount}" if amount else ""
        if finding.finding_focus == "repeated_payments_detected":
            return (
                f"Repeated payments were detected at {who}{money}. This is a review "
                "cue only and does not confirm a subscription or bill."
            )
        return f"A recurring payment pattern was observed at {who}{money}."
    if kind == "fees":
        focus = fee_focus or "bank fee activity"
        label = focus[0].upper() + focus[1:]
        return f"{label} — observed in the analysed period."
    if kind == "spending":
        subject = merchant or category or "Spending"
        change = values.get("absolute_change") or values.get("change_amount")
        if change:
            return (
                f"{subject} spending increased by {change} compared with the "
                "previous period."
            )
        return f"{subject} spending increased compared with the previous period."
    return _LABELS.get(finding.leak_type, "A spending pattern was observed.")


def _merchant_label(values: dict[str, str]) -> str | None:
    named = _named(
        values,
        ("merchant_display_name", "merchant_name", "merchant", "merchant_key"),
    )
    if named:
        return named
    raw = values.get("merchant_key")
    if not raw:
        return None
    if not is_reliable_merchant_display_name(raw):
        return None
    return merchant_display_name_for(raw) or display_merchant_label(raw)


def _evidence(finding: RegistryRow) -> tuple[tuple[str, str], ...]:
    lines: list[tuple[str, str]] = []
    for key, label, value in finding.evidence_highlights:
        rendered = _safe_highlight(key, label, value)
        if rendered is None:
            continue
        lines.append(rendered)
        if len(lines) == 12:
            break
    return tuple(lines)


def _highlight_map(finding: RegistryRow) -> dict[str, str]:
    values: dict[str, str] = {}
    for key, label, value in finding.evidence_highlights:
        rendered = _safe_highlight(key, label, value)
        if rendered is None or key in values:
            continue
        values[key] = rendered[1]
    return values


def _safe_highlight(
    key: str,
    label: str,
    value: str | int | bool,
) -> tuple[str, str] | None:
    if (
        not key
        or key.strip().lower() in _FORBIDDEN_KEYS
        or _LONG_DIGITS.search(key)
        or _LONG_DIGITS.search(label)
    ):
        return None
    if isinstance(value, bool):
        rendered = "Yes" if value else "No"
    elif isinstance(value, int):
        rendered = str(value)
    else:
        rendered = value.strip()
    if not rendered or _LONG_DIGITS.search(rendered) or len(rendered) > 120:
        return None
    return (label.strip()[:120], rendered)


def _named(values: dict[str, str], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = values.get(key)
        if not value:
            continue
        cleaned = value.strip()
        if key == "merchant_key" and is_reliable_merchant_display_name(cleaned):
            label = merchant_display_name_for(cleaned) or display_merchant_label(cleaned)
            if label and _SAFE_LABEL.fullmatch(label):
                return label
        if _SAFE_LABEL.fullmatch(cleaned):
            if key in {"merchant_key", "merchant_display_name", "merchant_name", "merchant"}:
                if is_reliable_merchant_display_name(cleaned):
                    return merchant_display_name_for(cleaned) or display_merchant_label(
                        cleaned
                    )
            return cleaned
    return None


def _period(finding: RegistryRow) -> str | None:
    if finding.period_start is None or finding.period_end is None:
        return None
    return f"{finding.period_start.isoformat()} to {finding.period_end.isoformat()}"


def _money(amount: Decimal) -> str:
    quantized = amount.quantize(Decimal("0.01"))
    return format(quantized, "f")
