"""How strongly the transactions establish a finding.

CONFIRMED  the statement itself shows the financial event (a fee row).
LIKELY     a stable pattern across several payments, some uncertainty remains.
POSSIBLE   a suspicious or one-window pattern the customer must verify.

The status describes the evidence for the event, not whether money was lost.
It is derived from the finding's own evidence by fixed rules, never from a model.
"""

from __future__ import annotations

from typing import Literal

EvidenceStatus = Literal["confirmed", "likely", "possible"]

LIKELY_MIN_CONFIDENCE = 0.70
LIKELY_MIN_OBSERVATIONS = 3

# Fee findings built from explicitly labelled fee rows.
_EXPLICIT_FEE_FOCUS = frozenset(
    {
        "sms_banking",
        "atm_balance_enquiry",
        "immediate_payment_fee",
        "foreign_transaction_fee",
        "interest_charges",
        "overdraft_fee_pattern",
        "insufficient_funds_charges",
        "monthly_banking_fee_trend",
        "recurring_merchant_fee_change",
    }
)
_RECURRING_TYPES = frozenset(
    {
        "subscription_leak",
        "recurring_payment_leak",
        "inactive_recurring_payment_leak",
        "duplicate_streaming_leak",
        "overlapping_cover_leak",
        "high_cost_credit_leak",
    }
)


def evidence_status_for(
    leak_type: str, evidence: dict[str, object], confidence: float
) -> tuple[EvidenceStatus, str]:
    kind = evidence.get("finding_kind")
    focus = evidence.get("finding_focus")
    if kind in {"verification_required", "spending_pattern"}:
        return (
            "possible",
            "The pattern needs the customer to verify it; the transactions alone do not settle it.",
        )
    if leak_type == "penalty_fee_leak":
        return (
            "confirmed",
            "The statement lists these penalty charges explicitly. Whether they were avoidable "
            "is not established.",
        )
    if leak_type == "bank_fee_leak":
        if focus in _EXPLICIT_FEE_FOCUS:
            return (
                "confirmed",
                "The statement lists these fees explicitly. Whether they were avoidable is not established.",
            )
        return (
            "likely",
            "Repeated bank fees were observed, but they are not one specific fee type.",
        )
    if leak_type in _RECURRING_TYPES:
        observations = evidence.get("observation_count")
        weak = focus == "repeated_payments_detected" or evidence.get("parallel_mandate_count")
        if (
            not weak
            and confidence >= LIKELY_MIN_CONFIDENCE
            and isinstance(observations, int)
            and observations >= LIKELY_MIN_OBSERVATIONS
        ):
            return (
                "likely",
                f"{observations} payments at a stable interval and amount establish the pattern.",
            )
        if (
            leak_type in {"duplicate_streaming_leak", "overlapping_cover_leak", "high_cost_credit_leak"}
            and confidence >= LIKELY_MIN_CONFIDENCE
        ):
            return (
                "likely",
                "Two or more recurring services of the same kind were paid in the same months.",
            )
        return (
            "possible",
            "The recurring pattern is short, weak or covers several mandates, so it needs verification.",
        )
    return (
        "possible",
        "This is a behavioural or one-off pattern; it is a cue to review, not an established loss.",
    )
