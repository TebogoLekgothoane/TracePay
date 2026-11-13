"""Split each finding into what the statements prove and what they only suggest.

"You paid this fee 17 times" is a fact about the rows. "You may be able to avoid
this fee" is a hypothesis about the user's options. They are different claims
and are returned apart. Every confirmed fact is computed from the supporting
transactions or from evidence the detector already measured. Every possible
leak says what a bank statement cannot show.
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Sequence

from .leak_models import (
    ConfirmedFact,
    LeakClaims,
    LeakDetection,
    LeakDetectionResult,
    PossibleLeak,
    SupportingTransaction,
)

_FEE_LABELS: dict[str, str] = {
    "sms_banking": "SMS banking fee",
    "atm_balance_enquiry": "ATM balance enquiry fee",
    "immediate_payment_fee": "immediate payment fee",
    "foreign_transaction_fee": "foreign transaction fee",
    "interest_charges": "interest charge",
    "overdraft_fee_pattern": "overdraft fee",
    "insufficient_funds_charges": "failed-payment fee",
    "recurring_merchant_fee_change": "card fee",
}
_RECURRING_TYPES = frozenset(
    {
        "subscription_leak",
        "recurring_payment_leak",
        "unknown_recurring_payment",
        "high_cost_credit_leak",
    }
)
_CATEGORY_TYPES = frozenset(
    {
        "airtime_data_leak",
        "food_spending_leak",
        "transport_spending_leak",
        "coffee_spending_leak",
        "convenience_store_leak",
        "weekend_spending_leak",
        "payday_spending_leak",
        "spending_escalation_leak",
    }
)


def attach_claims(result: LeakDetectionResult) -> LeakDetectionResult:
    """Return the result with ``claims`` filled on every finding."""
    # A finding that arrives with its claims (the statement review writes its own, from the
    # rows) keeps them; every other finding has its claims built here.
    return result.model_copy(
        update={
            "leaks": [
                leak
                if leak.claims is not None
                else leak.model_copy(update={"claims": claims_for(leak)})
                for leak in result.leaks
            ]
        }
    )


def claims_for(leak: LeakDetection) -> LeakClaims:
    builder = _builder_for(leak)
    confirmed = builder.confirmed(leak)
    if not confirmed:
        confirmed = _generic_rows_fact(leak)
    return LeakClaims(confirmed=confirmed, possible=builder.possible(leak))


# ---------------------------------------------------------------- formatting


def _dec(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except Exception:
        return None
    return number if number.is_finite() else None


def _money(value: Any) -> str:
    number = _dec(value)
    if number is None:
        return "an unknown amount"
    rounded = abs(number).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if rounded == rounded.to_integral_value():
        return f"R{int(rounded):,}".replace(",", " ")
    return f"R{rounded:,.2f}".replace(",", " ")


def _day(value: date) -> str:
    return f"{value.day} {value:%b %Y}"


def _as_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _span(first: date, last: date) -> str:
    if first == last:
        return f"on {_day(first)}"
    return f"between {_day(first)} and {_day(last)}"


def _times(count: int) -> str:
    return {1: "once", 2: "twice"}.get(count, f"{count} times")


def _rows(leak: LeakDetection, *roles: str) -> list[SupportingTransaction]:
    return [row for row in leak.supporting_transactions if row.role in roles]


def _complete(leak: LeakDetection) -> bool:
    """True when the listed rows are every row behind the finding.

    Supporting rows are capped, so totals are only quoted when nothing was cut.
    """
    return len(leak.supporting_transactions) == leak.supporting_transaction_count


def _rows_fact(
    label: str,
    rows: Sequence[SupportingTransaction],
    *,
    verb: str,
    leak: LeakDetection,
) -> ConfirmedFact | None:
    if not rows:
        return None
    dates = sorted(row.date for row in rows)
    count = len(rows)
    figures: dict[str, Any] = {
        "count": count,
        "first_date": dates[0].isoformat(),
        "last_date": dates[-1].isoformat(),
    }
    text = f"{verb} {label} {_times(count)}"
    if _complete(leak):
        total = sum((row.amount for row in rows), Decimal("0"))
        figures["total"] = str(total)
        text += f", {_money(total)} in all"
    return ConfirmedFact(text=f"{text}, {_span(dates[0], dates[-1])}.", figures=figures)


def _generic_rows_fact(leak: LeakDetection) -> list[ConfirmedFact]:
    rows = [row for row in leak.supporting_transactions if row.role != "reversal"]
    fact = _rows_fact(
        "matching transactions",
        rows,
        verb="Your statements show",
        leak=leak,
    )
    return [fact] if fact else []


def _name(leak: LeakDetection) -> str | None:
    evidence = leak.evidence
    for key in ("merchant_display_name", "merchant_key"):
        value = evidence.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


# ------------------------------------------------------------------ builders


class _Builder:
    """Fallback for finding types with no specific wording."""

    def confirmed(self, leak: LeakDetection) -> list[ConfirmedFact]:
        return []

    def possible(self, leak: LeakDetection) -> list[PossibleLeak]:
        return [
            PossibleLeak(
                text="This pattern may be worth reviewing.",
                cannot_see=["Whether the activity was intended or is still wanted."],
            )
        ]


class _BankFee(_Builder):
    def confirmed(self, leak: LeakDetection) -> list[ConfirmedFact]:
        evidence = leak.evidence
        focus = evidence.get("finding_focus")
        label = _FEE_LABELS.get(focus, "bank fee") if isinstance(focus, str) else "bank fee"
        facts: list[ConfirmedFact] = []
        rows = _rows(leak, "fee", "failed_attempt_fee")
        fact = _rows_fact(
            f"the {label}" if label != "bank fee" else "bank fees",
            rows,
            verb="You paid",
            leak=leak,
        )
        if fact:
            facts.append(fact)
        previous, current = _dec(evidence.get("previous_amount")), _dec(evidence.get("current_amount"))
        previous_period, current_period = evidence.get("previous_period"), evidence.get("current_period")
        if previous is not None and current is not None and previous_period and current_period:
            facts.append(
                ConfirmedFact(
                    text=(
                        f"Your bank fees were {_money(previous)} in {previous_period} "
                        f"and {_money(current)} in {current_period}."
                    ),
                    figures={"previous": str(previous), "current": str(current)},
                )
            )
        return facts

    def possible(self, leak: LeakDetection) -> list[PossibleLeak]:
        focus = leak.evidence.get("finding_focus")
        if focus == "atm_balance_enquiry":
            return [
                PossibleLeak(
                    text="You may be able to avoid this fee by checking your balance in your banking app.",
                    cannot_see=["Whether your bank's app shows your balance for free."],
                    check="Open your banking app and see whether the balance is shown without a charge.",
                )
            ]
        if focus == "sms_banking":
            return [
                PossibleLeak(
                    text="You may be able to avoid this fee by switching to free app notifications.",
                    cannot_see=["Whether your bank offers a free alternative on your account."],
                    check="Ask your bank, or look in the app, for no-fee notification options.",
                )
            ]
        if focus == "immediate_payment_fee":
            return [
                PossibleLeak(
                    text="Some of these payments may have been possible by a cheaper method.",
                    cannot_see=[
                        "How urgent each payment was.",
                        "What a slower payment method costs on your account.",
                    ],
                )
            ]
        if focus == "insufficient_funds_charges":
            return [
                PossibleLeak(
                    text="You may be able to avoid these fees by keeping enough in the account on collection days.",
                    cannot_see=[
                        "Why the balance was short on those days.",
                        "Whether the collections were expected.",
                    ],
                    check="Compare the dates of these fees with your payday and debit order dates.",
                )
            ]
        if focus in {"interest_charges", "overdraft_fee_pattern"}:
            return [
                PossibleLeak(
                    text="You may be able to reduce this cost by using less of the overdraft or credit.",
                    cannot_see=["The terms of your credit agreement."],
                )
            ]
        if focus == "foreign_transaction_fee":
            return [
                PossibleLeak(
                    text="Some of these fees may be avoidable with a different way of paying abroad.",
                    cannot_see=["Which cards or accounts on offer charge less."],
                )
            ]
        return [
            PossibleLeak(
                text="You may be paying more for banking than you need to.",
                cannot_see=[
                    "Which account tier you are on and what it includes.",
                    "What other accounts at your bank, or other banks, would charge you.",
                ],
                check="Compare your bank's published fee schedule with the fees listed here.",
            )
        ]


class _Recurring(_Builder):
    def confirmed(self, leak: LeakDetection) -> list[ConfirmedFact]:
        evidence = leak.evidence
        name = _name(leak)
        facts: list[ConfirmedFact] = []
        who = name or "an unidentified payee"
        rows = _rows(leak, "payment")
        fact = _rows_fact(
            f"{who}",
            rows,
            verb="You paid",
            leak=leak,
        )
        if fact:
            facts.append(fact)
        latest = _dec(evidence.get("latest_amount"))
        if fact and latest is not None:
            facts.append(
                ConfirmedFact(
                    text=f"The most recent payment was {_money(latest)}.",
                    figures={"latest_amount": str(latest)},
                )
            )
        interval = _dec(evidence.get("median_interval_days")) or _dec(evidence.get("average_interval_days"))
        if interval is not None and evidence.get("observation_count"):
            facts.append(
                ConfirmedFact(
                    text=f"The payments repeated about every {int(interval.quantize(Decimal('1'), rounding=ROUND_HALF_UP))} days.",
                    figures={"interval_days": str(interval)},
                )
            )
        first, latest = _dec(evidence.get("first_amount")), _dec(evidence.get("latest_amount"))
        if evidence.get("price_change_focus") and first is not None and latest is not None and latest > first:
            steps = evidence.get("price_increase_count")
            step_text = (
                f", in {steps} step{'s' if steps != 1 else ''}"
                if isinstance(steps, int) and steps > 0
                else ""
            )
            facts.append(
                ConfirmedFact(
                    text=f"The amount rose from {_money(first)} to {_money(latest)}{step_text}.",
                    figures={"first_amount": str(first), "latest_amount": str(latest)},
                )
            )
            extra_paid = _dec(evidence.get("additional_paid_to_date"))
            if extra_paid is not None and extra_paid > 0:
                facts.append(
                    ConfirmedFact(
                        text=f"You have paid {_money(extra_paid)} more than the original amount since the first increase.",
                        figures={"additional_paid_to_date": str(extra_paid)},
                    )
                )
        failed = evidence.get("failed_payment_attempt_count")
        if isinstance(failed, int) and failed > 0:
            facts.append(
                ConfirmedFact(
                    text=f"{_times(failed).capitalize()} a collection for {who} failed.",
                    figures={"failed_attempts": failed},
                )
            )
        return facts

    def possible(self, leak: LeakDetection) -> list[PossibleLeak]:
        evidence = leak.evidence
        focus = evidence.get("finding_focus")
        possible: list[PossibleLeak] = []
        if focus == "subscription_review":
            possible.append(
                PossibleLeak(
                    text="You may be paying for a service you no longer use.",
                    cannot_see=[
                        "Whether you use the service.",
                        "Whether you already cancelled it.",
                    ],
                    check="Open the service's own account or app and look at your plan and recent activity.",
                )
            )
        elif focus == "debit_order_review":
            possible.append(
                PossibleLeak(
                    text="You may not need this debit order any more.",
                    cannot_see=[
                        "What the debit order is for.",
                        "Whether your agreement with them is still in force.",
                    ],
                    check="Find the mandate or contract that set up this debit order.",
                )
            )
        else:
            possible.append(
                PossibleLeak(
                    text="This may be a recurring cost worth reviewing.",
                    cannot_see=["What the payments are for, and whether they are still wanted."],
                )
            )
        if leak.leak_type == "unknown_recurring_payment" or not _name(leak):
            possible.append(
                PossibleLeak(
                    text="You may not recognise who is collecting this.",
                    cannot_see=["Who the payee really is behind the name on the statement."],
                    check="Search the statement text, or ask your bank who the collector is.",
                )
            )
        if evidence.get("price_change_focus"):
            possible.append(
                PossibleLeak(
                    text="The provider may have raised the price without you agreeing to it.",
                    cannot_see=[
                        "Whether you were told about the new price.",
                        "Whether you moved to a different plan yourself.",
                    ],
                    check="Compare the new amount with the price on the provider's current plan page.",
                )
            )
        return possible


class _Inactive(_Builder):
    def confirmed(self, leak: LeakDetection) -> list[ConfirmedFact]:
        evidence = leak.evidence
        name = _name(leak) or "this payee"
        last = _as_date(evidence.get("last_observed_date"))
        interval = _dec(evidence.get("expected_interval_days"))
        days = evidence.get("days_since_last_observed")
        facts: list[ConfirmedFact] = []
        if last is not None:
            facts.append(
                ConfirmedFact(
                    text=f"The last payment to {name} in your statements was on {_day(last)}.",
                    figures={"last_date": last.isoformat()},
                )
            )
        if interval is not None and isinstance(days, int):
            facts.append(
                ConfirmedFact(
                    text=(
                        f"Before that it arrived about every "
                        f"{int(interval.quantize(Decimal('1'), rounding=ROUND_HALF_UP))} days; "
                        f"{days} days have passed since."
                    ),
                    figures={"days_since": days},
                )
            )
        return facts

    def possible(self, leak: LeakDetection) -> list[PossibleLeak]:
        return [
            PossibleLeak(
                text="This payment may have stopped, or been cancelled.",
                cannot_see=[
                    "Whether it was cancelled, moved to another account, or is just missing from the statements uploaded.",
                ],
                check="Upload any statements covering the gap, or ask the payee about the account.",
            )
        ]


class _Duplicate(_Builder):
    def confirmed(self, leak: LeakDetection) -> list[ConfirmedFact]:
        evidence = leak.evidence
        amount = _dec(evidence.get("candidate_amount"))
        count = evidence.get("transaction_count_in_group")
        first = _as_date(evidence.get("observed_date"))
        latest = _as_date(evidence.get("latest_observed_date")) or first
        if amount is None or not isinstance(count, int) or first is None or latest is None:
            return []
        who = _name(leak) or "the same payee"
        gap = (latest - first).days
        when = f"on {_day(first)}" if gap == 0 else f"on {_day(first)} and {_day(latest)} ({gap} days apart)"
        return [
            ConfirmedFact(
                text=f"{_money(amount)} was paid to {who} {_times(count)}, {when}.",
                figures={"amount": str(amount), "count": count, "days_apart": gap},
            )
        ]

    def possible(self, leak: LeakDetection) -> list[PossibleLeak]:
        recurring = leak.leak_type == "duplicate_debit_order_leak"
        cannot = [
            "Whether these were two separate purchases or one charge taken twice.",
            "Whether the merchant has already refunded one.",
        ]
        if recurring:
            cannot = [
                "Whether the second collection was an arrears catch-up, a changed collection date, or a separate mandate.",
                "Whether the merchant has already refunded one.",
            ]
        return [
            PossibleLeak(
                text="You may have been charged twice for the same thing.",
                cannot_see=cannot,
                check="Ask the merchant for the order or billing records for those dates.",
            )
        ]


class _Streaming(_Builder):
    def confirmed(self, leak: LeakDetection) -> list[ConfirmedFact]:
        evidence = leak.evidence
        names = evidence.get("streaming_service_names")
        combined = _dec(evidence.get("combined_monthly_streaming_spend"))
        months = evidence.get("overlapping_month_count")
        if not isinstance(names, list) or not names or combined is None:
            return []
        listed = ", ".join(str(item) for item in names)
        text = f"You paid for {listed} at the same time, {_money(combined)} a month combined"
        if isinstance(months, int) and months > 0:
            text += f", across {months} overlapping month{'s' if months != 1 else ''}"
        return [ConfirmedFact(text=text + ".", figures={"services": names, "combined_monthly": str(combined)})]

    def possible(self, leak: LeakDetection) -> list[PossibleLeak]:
        return [
            PossibleLeak(
                text="You may not need all of these services.",
                cannot_see=["Which services you actually watch, or whether they are shared with others."],
            )
        ]


class _Cash(_Builder):
    def confirmed(self, leak: LeakDetection) -> list[ConfirmedFact]:
        evidence = leak.evidence
        count = evidence.get("cash_withdrawal_count")
        total = _dec(evidence.get("cash_withdrawal_total"))
        facts: list[ConfirmedFact] = []
        if isinstance(count, int) and total is not None:
            facts.append(
                ConfirmedFact(
                    text=f"You made {count} cash withdrawals totalling {_money(total)}.",
                    figures={"withdrawals": count, "total": str(total)},
                )
            )
        fee_total, fee_count = _dec(evidence.get("atm_fee_total")), evidence.get("atm_fee_count")
        if fee_total is not None and isinstance(fee_count, int):
            facts.append(
                ConfirmedFact(
                    text=f"You were charged ATM fees {_times(fee_count)}, {_money(fee_total)} in all.",
                    figures={"fees": fee_count, "fee_total": str(fee_total)},
                )
            )
        share = _dec(evidence.get("cash_withdrawal_share"))
        if share is not None and evidence.get("finding_focus") == "cash_dependency":
            facts.append(
                ConfirmedFact(
                    text=f"Cash withdrawals were about {int((share * 100).quantize(Decimal('1')))}% of what you spent.",
                    figures={"share": str(share)},
                )
            )
        return facts

    def possible(self, leak: LeakDetection) -> list[PossibleLeak]:
        if leak.evidence.get("finding_focus") == "atm_withdrawal_fee_stacking":
            return [
                PossibleLeak(
                    text="Fewer, larger withdrawals may cost you less in fees.",
                    cannot_see=[
                        "Your bank's fee schedule: the fee may be a flat amount per withdrawal or depend on the amount.",
                        "Whose ATM each withdrawal used.",
                    ],
                    check="Look up your bank's ATM withdrawal fees for your account.",
                )
            ]
        return [
            PossibleLeak(
                text="You may be able to pay by card for some of this cash spending.",
                cannot_see=["What the cash was spent on, or whether card was accepted there."],
            )
        ]


class _Category(_Builder):
    def confirmed(self, leak: LeakDetection) -> list[ConfirmedFact]:
        evidence = leak.evidence
        previous, current = _dec(evidence.get("previous_amount")), _dec(evidence.get("current_amount"))
        previous_period, current_period = evidence.get("previous_period"), evidence.get("current_period")
        what = evidence.get("category_name") or "this spending"
        if previous is None or current is None or not previous_period or not current_period:
            return []
        verb = "rose" if current > previous else "changed"
        return [
            ConfirmedFact(
                text=f"Your {what} spending {verb} from {_money(previous)} in {previous_period} to {_money(current)} in {current_period}.",
                figures={"previous": str(previous), "current": str(current)},
            )
        ]

    def possible(self, leak: LeakDetection) -> list[PossibleLeak]:
        return [
            PossibleLeak(
                text="You may be spending more here than you mean to.",
                cannot_see=["Whether the increase was planned, a one-off, or a change in circumstances."],
            )
        ]


class _Unusual(_Builder):
    def confirmed(self, leak: LeakDetection) -> list[ConfirmedFact]:
        evidence = leak.evidence
        amount = _dec(evidence.get("transaction_amount"))
        median = _dec(evidence.get("category_median_amount"))
        when = _as_date(evidence.get("transaction_date"))
        if amount is None or median is None or when is None:
            return []
        category = evidence.get("category_name") or "its category"
        return [
            ConfirmedFact(
                text=f"A payment of {_money(amount)} on {_day(when)} was well above the usual {_money(median)} in {category}.",
                figures={"amount": str(amount), "category_median": str(median)},
            )
        ]

    def possible(self, leak: LeakDetection) -> list[PossibleLeak]:
        return [
            PossibleLeak(
                text="This payment may be a mistake worth checking.",
                cannot_see=["Whether it was an intended one-off purchase.", "Whether it was authorised by you."],
                check="Match it against your receipt or order history.",
            )
        ]


def _builder_for(leak: LeakDetection) -> _Builder:
    kind = leak.leak_type
    if kind == "bank_fee_leak":
        return _BankFee()
    if kind in _RECURRING_TYPES:
        return _Recurring()
    if kind == "inactive_recurring_payment_leak":
        return _Inactive()
    if kind in {"duplicate_payment_leak", "duplicate_debit_order_leak"}:
        return _Duplicate()
    if kind == "duplicate_streaming_leak":
        return _Streaming()
    if kind == "cash_usage_leak":
        return _Cash()
    if kind == "irregular_transaction_leak":
        return _Unusual()
    if kind in _CATEGORY_TYPES:
        return _Category()
    return _Builder()
