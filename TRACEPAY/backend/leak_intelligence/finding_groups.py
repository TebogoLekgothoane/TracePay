"""Which of three honest groups a finding belongs to.

A bank statement shows what was paid, not whether it was wasted. Findings are grouped by
how far they can be called money back in the customer's hands, and the groups are never
merged into one "money lost" figure:

* ``recoverable``: payments or fees that are often avoidable or refundable once checked
  (duplicate payments and debit orders, penalty fees, bank fees).
* ``review``: payments that may be unnecessary and need the customer's judgement
  (subscriptions, recurring payments, overlapping cover, unusual transactions).
* ``commitment``: where money goes. Gambling, credit repayments, regular payments to a
  person, airtime and everyday spending patterns are choices or obligations, not leaks.
"""

from __future__ import annotations

from typing import Any, Literal, Mapping

ValueGroup = Literal["recoverable", "review", "commitment"]

_RECOVERABLE = frozenset(
    {"duplicate_payment_leak", "duplicate_debit_order_leak", "penalty_fee_leak"}
)
_REVIEW = frozenset(
    {
        "subscription_leak",
        "recurring_payment_leak",
        "unknown_recurring_payment",
        "inactive_recurring_payment_leak",
        "duplicate_streaming_leak",
        "overlapping_cover_leak",
        "irregular_transaction_leak",
        "cash_usage_leak",
        "money_pass_through_leak",
    }
)
_COMMITMENT = frozenset(
    {
        "gambling_spending_leak",
        "high_cost_credit_leak",
        "recurring_transfer_leak",
        "airtime_data_leak",
        "spending_escalation_leak",
        "food_spending_leak",
        "transport_spending_leak",
        "coffee_spending_leak",
        "convenience_store_leak",
        "weekend_spending_leak",
        "payday_spending_leak",
    }
)
# Interest and overdraft charges are the cost of borrowing, not an avoidable bank fee.
_BORROWING_FEE_FOCUS = frozenset({"interest_charges", "overdraft_fee_pattern"})


def value_group_for(leak_type: str, evidence: Mapping[str, Any] | None = None) -> ValueGroup:
    if leak_type in _RECOVERABLE:
        return "recoverable"
    if leak_type == "bank_fee_leak":
        focus = (evidence or {}).get("finding_focus")
        return "review" if focus in _BORROWING_FEE_FOCUS else "recoverable"
    if leak_type in _COMMITMENT:
        return "commitment"
    # Anything new starts as "review": it never claims money back by default.
    return "review"
