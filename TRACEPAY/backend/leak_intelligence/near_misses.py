"""Plain reasons for look-alikes the detectors looked at and did not raise.

One table, so the wording is the same wherever a rule passes something over and so a
reason can be checked against the rule it describes. Reasons name a merchant, an amount
and dates, never a description or a transaction id.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Iterable

from .merchant_display import merchant_display_name_for
from .models import NearMiss

REASONS: dict[str, str] = {
    # Duplicate payments
    "below_minimum_amount": "Repeats under the minimum amount are usually separate purchases.",
    "outside_day_window": "Identical payments more than three days apart are treated as separate purchases.",
    "repeated_routine": (
        "This merchant and amount appears three or more times, so it looks like a habit or a "
        "subscription, not a double charge."
    ),
    "repeated_amount": (
        "You pay this merchant this exact amount more than once, so it is a routine "
        "purchase, not an unusual one."
    ),
    "multiple_of_regular_amount": (
        "This is two or three times the regular amount, so it is most likely missed "
        "months billed together, not an unusual purchase."
    ),
    "cause_not_identified": (
        "Spending was higher than usual, but the merchants behind it explain only a small "
        "part of the rise, so it is not reported as a spending problem."
    ),
    "mostly_unidentified": (
        "A large share of this spending is made of payments TracePay could not identify, so "
        "it cannot say your spending really rose. Tell it what they are to see this finding."
    ),
    "merchant_not_recognised": (
        "The merchant was not recognised with enough confidence to call this a duplicate."
    ),
    "refund_nearby": "A refund or reversal of the same amount sits next to these payments.",
    "unrecognised_payee_needs_close_pair": (
        "The payee is not recognised, so only two identical payments within 15 minutes count."
    ),
    "excluded_category": "Transfers, cash and savings are not treated as duplicate payments.",
    "habitual_same_day_repeat": (
        "This merchant and amount doubles up on several days, so it looks like a routine."
    ),
    "hours_apart": "The payments were more than 30 minutes apart: two purchases, not a double charge.",
    "untimed_group_size": (
        "Without times, only exactly two identical payments count; three or more look routine."
    ),
    "untimed_below_minimum": "Without times, only same-day repeats of R100 or more are raised.",
    "everyday_spend": (
        "Food, fuel, transport and airtime are often bought twice in a day, so these are not raised."
    ),
    "different_descriptions": "The statement descriptions differ and share no payment reference.",
    # Subscriptions and recurring payments
    "merchant_not_confident": (
        "The merchant was not recognised with enough confidence to call this a recurring payment."
    ),
    "recurrence_not_established": (
        "These charges do not follow a steady enough pattern to call a subscription yet."
    ),
    "too_few_charges": "Too few charges have been seen to call this a recurring payment.",
    "interval_not_billing_like": "The gaps between charges do not look like a billing cycle.",
    "handled_as_duplicate": (
        "Handled as a possible duplicate instead, so it is not also raised as a recurring payment."
    ),
    "app_store_not_monthly": "App-store charges are only treated as subscriptions when billed monthly.",
    "below_minimum_impact": "Costs under R10 a month, below the level worth raising.",
    "spending_habit": (
        "Looks like a spending habit (food, coffee, airtime or shopping), not a recurring bill."
    ),
    "parallel_mandates": (
        "Several mandates at one merchant are separate commitments, not one finding."
    ),
    "confidence_too_low": "There was not enough evidence to raise it with confidence.",
    # Inactive recurring payments
    "still_within_expected_window": (
        "A regular payment is only flagged as missing once it is well past its expected date."
    ),
    "missing_needs_three_charges": (
        "Two charges were seen and then none; three are needed before a missing one is flagged."
    ),
    # Unusual transactions
    "below_outlier_multiple": "Large for its category, but under three times the usual amount.",
    "below_outlier_amount": "Unusual for its category, but under R500.",
    "too_little_history": (
        "Not enough other purchases in this category to judge what is normal (four are needed)."
    ),
    # Bank fees
    "single_fee": "Only one fee has been seen; two or more are needed.",
    "no_full_month": "There is no full month of statements yet to average the fees over.",
    "fees_too_small": "Fees average under R10 a month.",
    "fees_below_trigger": (
        "Fees are below the level raised without a clear pattern (R100 a month and 2% of spending)."
    ),
}


def build_near_miss(
    leak_type: str,
    code: str,
    *,
    amount: Decimal,
    merchant: str | None = None,
    dates: Iterable[date] = (),
    detail: str | None = None,
) -> NearMiss:
    # A debug aid must never break detection, so an unknown code degrades to a generic line.
    reason = REASONS.get(code, "A rule passed this over.")
    return NearMiss(
        leak_type=leak_type,
        reason_code=code,
        reason=f"{reason} {detail}" if detail else reason,
        merchant=merchant,
        merchant_display_name=merchant_display_name_for(merchant) if merchant else None,
        amount=amount,
        dates=list(dates),
    )
