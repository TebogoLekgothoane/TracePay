"""Where the money goes, read from the level and frequency of spending, not from its growth.

The engine's spending findings are about change: a category that rose against earlier
months, a new recurring charge, a duplicate. A habit that is steady from the first month
never changes, so it is never raised, although it may be the largest thing on the
statement. These findings state the level: how often, how much over the period, and at
what cost in fees. None claims the money was wasted; each lists the rows behind it.

Three further things the rows show that no growth rule sees are read here too: a merchant
visited many times a month for small amounts, a small unexplained debit that repeats within
weeks, and a balance that runs out.
"""

from __future__ import annotations

import calendar
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Callable

from .engine import CASH_WITHDRAWAL_CATEGORIES, _is_ride_hailing_transaction
from .models import FeatureTransaction
from .statement_review import (
    ReviewFinding,
    _ZERO,
    _is_debit,
    _join,
    _klass,
    _month_key,
    _month_name,
    _purchases,
    delivery_service,
    evidence_rows,
    money,
    payee_name,
)

# Every limit here is relative to the statement itself, so the same rule reads a student's
# account and a salaried one. The only absolute numbers are counts: how many times a thing
# must happen before it is a pattern rather than an occasion.
#
# A habit: at least HABIT_MIN_COUNT purchases over the period (twice a month across a
# quarter), taking at least HABIT_MIN_SHARE of everything spent.
HABIT_MIN_COUNT = 6
HABIT_MIN_SHARE = Decimal("0.03")
# A few purchases that are still a large share of what was spent. Count alone would
# hide four restaurant meals or a handful of delivery orders that dominate the period.
# They also have to be spread out: three meals on one weekend are an occasion, on any account.
MATERIAL_HABIT_MIN_COUNT = 3
MATERIAL_HABIT_MIN_SHARE = Decimal("0.05")
MATERIAL_HABIT_MIN_SPAN_DAYS = 14
_MATERIAL_HABITS = frozenset({"eating_out", "delivery"})
# A frequent shop: visited on at least one day in FREQUENT_DAY_FRACTION of a calendar month,
# at an average under the statement's own typical purchase.
FREQUENT_DAY_FRACTION = 3
# An unexplained debit: repeated UNEXPLAINED_MIN_REPEATS times within a month, each under the
# statement's typical purchase, with the amount itself repeating.
UNEXPLAINED_MIN_REPEATS = 3
UNEXPLAINED_WINDOW_DAYS = 30
# A balance that has run out: below the statement's typical purchase on LOW_BALANCE_MIN_DAYS
# separate days, or below zero at all.
LOW_BALANCE_MIN_DAYS = 3

_EATING_OUT_CATEGORIES = frozenset(
    {"restaurants", "fast food", "takeaways", "takeaway", "eating out", "food & dining", "dining", "coffee"}
)
_GROCERY_CATEGORIES = frozenset({"groceries", "grocery", "supermarket"})
_EATING_OUT_WORDS = re.compile(
    r"\b(?:KFC|NANDO'?S?|STEERS|DEBONAIRS|WIMPY|SPUR|MCD|MCDONALD'?S?|CHICKEN|FISHAWAYS|"
    r"OCEAN BASKET|KING PIE|CHAMPS|BURGER|PIZZA|CAFE|RESTAURANT|GRILL|FOODS?|SPAZA|TAKE ?AWAYS?|"
    r"DINER|KITCHEN|BISTRO|BAKERY|COFFEE|ROMAN'?S|GALITO'?S|CHESA ?NYAMA|KAUAI|SUSHI|FISH)\b",
    re.IGNORECASE,
)
_CASH_WORDS = re.compile(
    r"\bATM\b.*\bCASH\b|\bCASH\b.*\bATM\b|CASH WITHDRAWAL|\bWITHDRAWAL\b", re.IGNORECASE
)
_ATM_FEE_WORDS = re.compile(r"\bATM\b|\bSSD\b|CASH WITHDRAWAL|WITHDRAWAL FEE", re.IGNORECASE)
# Airtime and data have their own finding, whoever sells them.
_AIRTIME_WORDS = re.compile(
    r"airtime|prepaid|\bdata\b|\bbundle\b|\bMTN\b|vodacom|cell ?c|telkom|\brain\b", re.IGNORECASE
)


# Ride-hailing descriptors: "Uber", "Bolt", "DL Bolt", "DLO*BOLT.EU/O/<card>".
_RIDE_WORDS = re.compile(r"(?<![A-Z])(?:UBER|BOLT)(?![A-Z])", re.IGNORECASE)
_UBER_EATS = re.compile(r"UBER\s*EATS", re.IGNORECASE)


def _is_ride(tx: FeatureTransaction) -> bool:
    # BOLT.EU/S/ is the subscription path. BOLT.EU/O/ and "DL Bolt" are rides.
    text = f"{tx.merchant_name or ''} {tx.description or ''}"
    if "BOLT.EU/S/" in text.upper().replace(" ", ""):
        return False
    if _is_ride_hailing_transaction(tx):
        return True
    return bool(_RIDE_WORDS.search(text)) and not _UBER_EATS.search(text)


def _signed_money(value: Decimal) -> str:
    return f"-{money(-value)}" if value < 0 else money(value)


def _category(tx: FeatureTransaction) -> str:
    return (tx.categorisation.category_name or "").strip().casefold()


def _is_eating_out(tx: FeatureTransaction) -> bool:
    if delivery_service(tx.description) or _is_ride(tx):
        return False
    category = _category(tx)
    if category in _GROCERY_CATEGORIES:
        return False
    if category in _EATING_OUT_CATEGORIES:
        return True
    return bool(_EATING_OUT_WORDS.search(tx.description or ""))


def _is_delivery(tx: FeatureTransaction) -> bool:
    return delivery_service(tx.description) is not None


def _is_airtime(tx: FeatureTransaction) -> bool:
    if _category(tx) == "airtime & data":
        return True
    return bool(_AIRTIME_WORDS.search(tx.description or ""))


def _is_cash(tx: FeatureTransaction) -> bool:
    if tx.categorisation.category_name in CASH_WITHDRAWAL_CATEGORIES:
        return True
    if tx.categorisation.rule == "description:cash-withdrawal":
        return True
    return _klass(tx) != "bank_fee" and bool(_CASH_WORDS.search(tx.description or ""))


@dataclass(frozen=True)
class _Habit:
    key: str
    leak_type: str
    title: str
    unit: str
    matches: Callable[[FeatureTransaction], bool]
    # Purchases only, or every debit (cash is often not classed as a purchase).
    from_purchases: bool = True


_HABITS = (
    _Habit("eating_out", "food_spending_leak", "Takeaways and restaurants", "purchases", _is_eating_out),
    _Habit("rides", "transport_spending_leak", "Bolt and Uber rides", "rides", _is_ride),
    _Habit("delivery", "food_spending_leak", "Food delivery", "orders", _is_delivery),
    _Habit("cash", "cash_usage_leak", "Cash withdrawals", "withdrawals", _is_cash, from_purchases=False),
)


def typical_purchase(txs: list[FeatureTransaction]) -> Decimal:
    """The statement's median purchase: what one ordinary spend costs this customer."""
    amounts = sorted(tx.amount for tx in _purchases(txs) if tx.amount > 0)
    if not amounts:
        return _ZERO
    middle = len(amounts) // 2
    return amounts[middle] if len(amounts) % 2 else (amounts[middle - 1] + amounts[middle]) / 2


#: A purchase this many times the statement's typical purchase, at a payee seen only once in
#: the period, is a one-off: it is reported on its own and does not set the scale a habit is
#: judged against. The same size at a payee seen again is a regular cost and stays in.
ONE_OFF_MULTIPLE = 10


def is_one_off(tx: FeatureTransaction, txs: list[FeatureTransaction]) -> bool:
    typical = typical_purchase(txs)
    if typical <= 0 or tx.amount <= typical * ONE_OFF_MULTIPLE:
        return False
    return sum(1 for other in _purchases(txs) if payee_name(other) == payee_name(tx)) == 1


def spending_base(txs: list[FeatureTransaction]) -> Decimal:
    """Everyday spending in the period: purchases and cash, never transfers, fees or one-offs.

    One large purchase (a laptop, a deposit) would otherwise make every habit look small
    beside it. It is left out here and reported as the one-off it is.
    """
    everyday = [tx for tx in _purchases(txs) if not is_one_off(tx, txs)]
    return sum((tx.amount for tx in everyday), _ZERO) + sum(
        (
            tx.amount
            for tx in txs
            if _is_debit(tx) and _is_cash(tx) and _klass(tx) not in {"spending", "unknown"}
        ),
        _ZERO,
    )


def _monthly(total: Decimal, month_count: int) -> Decimal:
    return (total / max(month_count, 1)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _whole(value: Decimal) -> Decimal:
    return value.quantize(Decimal(1), rounding=ROUND_HALF_UP)


def _same_day_identical(txs: list[FeatureTransaction]) -> list[tuple[date, Decimal, int]]:
    counts = Counter((tx.transaction_date, payee_name(tx), tx.amount) for tx in txs)
    return sorted((day, amount, n) for (day, _name, amount), n in counts.items() if n > 1)


def spending_habits(
    txs: list[FeatureTransaction], month_count: int, *, delivery_raised: bool = False
) -> list[ReviewFinding]:
    """One line per habit the period shows: count, total, a month, top payees, busy days."""
    findings: list[ReviewFinding] = []
    purchases = _purchases(txs)
    debits = [tx for tx in txs if _is_debit(tx) and tx.transaction_date]
    base = spending_base(txs)
    for habit in _HABITS:
        if habit.key == "delivery" and delivery_raised:
            continue
        pool = purchases if habit.from_purchases else debits
        rows = [tx for tx in pool if habit.matches(tx)]
        if not rows or base <= 0:
            continue
        total = sum((tx.amount for tx in rows), _ZERO)
        monthly = _monthly(total, month_count)
        share = total / base
        dated = [tx.transaction_date for tx in rows if tx.transaction_date is not None]
        span_days = (max(dated) - min(dated)).days if dated else 0
        material = (
            habit.key in _MATERIAL_HABITS
            and len(rows) >= MATERIAL_HABIT_MIN_COUNT
            and share >= MATERIAL_HABIT_MIN_SHARE
            and span_days >= MATERIAL_HABIT_MIN_SPAN_DAYS
        )
        if (len(rows) < HABIT_MIN_COUNT and not material) or share < HABIT_MIN_SHARE:
            continue
        by_payee: dict[str, Decimal] = defaultdict(lambda: _ZERO)
        counts: Counter[str] = Counter()
        for tx in rows:
            by_payee[payee_name(tx)] += tx.amount
            counts[payee_name(tx)] += 1
        top = sorted(by_payee.items(), key=lambda item: -item[1])[:3]
        top_text = _join([f"{name} ({counts[name]}, {money(amount)})" for name, amount in top])
        percent = int((share * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
        sentences = [
            f"**{habit.title}:** {len(rows)} {habit.unit}, {money(total)} over the period, "
            f"about {money(monthly)} a month, {percent}% of everyday spending."
        ]
        if len(by_payee) > 1:
            sentences.append(f"Most to {top_text}.")
        busy = Counter(tx.transaction_date for tx in rows)
        busy_days = sorted(day for day, n in busy.items() if n >= 3)
        if busy_days and habit.key != "cash":
            busiest = max(busy, key=busy.get)
            sentences.append(
                f"{len(busy_days)} day{'s' if len(busy_days) != 1 else ''} with three or more "
                f"(most: {busy[busiest]} on {busiest:%d %b})."
            )
        figures: dict[str, object] = {
            "total": total,
            "count": len(rows),
            "monthly": monthly,
            "share_of_spending": share,
        }
        if habit.key == "rides":
            pairs = _same_day_identical(rows)
            if pairs:
                listed = _join([f"{money(amount)} x{n} on {day:%d %b}" for day, amount, n in pairs[:6]])
                sentences.append(
                    f"Same-day identical charges: {listed}. Often separate trips; worth a "
                    "look in the app's ride history in case one was charged twice."
                )
                figures["same_day_identical"] = [
                    {"date": day.isoformat(), "amount": amount, "count": n} for day, amount, n in pairs
                ]
        if habit.key == "cash":
            fees = [
                tx
                for tx in txs
                if _klass(tx) == "bank_fee" and _is_debit(tx) and _ATM_FEE_WORDS.search(tx.description or "")
            ]
            fee_total = sum((tx.amount for tx in fees), _ZERO)
            if fee_total > 0:
                sentences.append(
                    f"ATM fees in the period came to {money(fee_total)}; fewer, larger withdrawals "
                    "cost less in fees."
                )
                figures["fee_total"] = fee_total
            small = [tx for tx in rows if tx.amount <= Decimal("200")]
            if len(small) * 2 > len(rows):
                sentences.append(f"{len(small)} of the {len(rows)} were R200 or less.")
        findings.append(
            ReviewFinding(
                key=f"habit:{habit.key}",
                group="commitment",
                leak_type=habit.leak_type,
                title=habit.title,
                display="item",
                line=" ".join(sentences) + f" (`{habit.leak_type}`, where the money goes).",
                figures=figures,
                rows=evidence_rows(rows, habit.unit.rstrip("s")),
            )
        )
    return findings


_DIGIT_RUN = re.compile(r"\d{4,}")
# A card purchase carries a long card or terminal reference; a system debit carries short codes.
_CARD_REFERENCE = re.compile(r"\d{10,}")


def _merchant_key(tx: FeatureTransaction) -> str:
    """A payee's own spelling with card references removed, so each spelling is one merchant."""
    name = payee_name(tx) or (tx.description or "")
    return re.sub(r"\s+", " ", _DIGIT_RUN.sub("", name)).strip().upper()


def _display_label(tx: FeatureTransaction, key: str) -> str:
    """The payee as the customer would say it: no card reference, sentence case if shouted."""
    name = _DIGIT_RUN.sub("", payee_name(tx) or "").strip() or key
    return name.title() if name.isupper() else name


def frequent_small_purchases(txs: list[FeatureTransaction], month_count: int) -> list[ReviewFinding]:
    """A merchant visited many times in a month for small amounts: a daily habit by any name.

    Judged by count and average alone, so an unrecognised corner shop is found as readily as a
    chain. Delivery, rides and cash have their own lines and are left out.
    """
    by_key: dict[str, list[FeatureTransaction]] = defaultdict(list)
    for tx in _purchases(txs):
        if _is_delivery(tx) or _is_ride(tx) or _is_cash(tx) or _is_airtime(tx):
            continue
        if not (payee_name(tx) or "").strip():
            continue
        by_key[_merchant_key(tx)].append(tx)
    typical = typical_purchase(txs)
    findings: list[ReviewFinding] = []
    for key, rows in by_key.items():
        if not key:
            continue
        per_month = Counter(_month_key(tx.transaction_date) for tx in rows)
        busiest, most = max(per_month.items(), key=lambda item: item[1])
        year, month = (int(part) for part in busiest.split("-"))
        days_in_month = calendar.monthrange(year, month)[1]
        days_visited = len(
            {tx.transaction_date for tx in rows if _month_key(tx.transaction_date) == busiest}
        )
        total = sum((tx.amount for tx in rows), _ZERO)
        average = total / len(rows)
        if days_visited * FREQUENT_DAY_FRACTION < days_in_month or average >= typical:
            continue
        label = _display_label(rows[0], key)
        findings.append(
            ReviewFinding(
                key=f"frequent:{key}",
                group="commitment",
                leak_type="convenience_store_leak",
                title=f"Frequent small purchases at {label}",
                display="item",
                line=(
                    f"**{label}:** {len(rows)} purchases, {money(total)} over the period "
                    f"(about {money(_monthly(total, month_count))} a month), averaging "
                    f"{money(_whole(average))} against a typical purchase of {money(_whole(typical))}; "
                    f"{most} in {_month_name(busiest)}, on {days_visited} of its {days_in_month} days "
                    "(`convenience_store_leak`, where the money goes)."
                ),
                figures={
                    "total": total,
                    "count": len(rows),
                    "average": average,
                    "typical_purchase": typical,
                    "busiest_month": busiest,
                    "days_visited": days_visited,
                },
                rows=evidence_rows(rows, "purchase"),
            )
        )
    findings.sort(key=lambda item: -Decimal(str(item.figures["total"])))
    return findings[:3]


def _unexplained_key(tx: FeatureTransaction) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\d", "", tx.description or "")).strip().upper()


def unexplained_small_debits(txs: list[FeatureTransaction], month_count: int) -> list[ReviewFinding]:
    """A small debit nothing recognises, repeating within weeks. Not a purchase, not monthly.

    The monthly-recurrence rules need a charge once a month for three months. A R10 debit every
    few days, worded like a system reference, never qualifies, yet it is exactly the line a
    customer cannot place. Raised as a question, with the rows.
    """
    by_key: dict[str, list[FeatureTransaction]] = defaultdict(list)
    typical = typical_purchase(txs)
    for tx in txs:
        if not _is_debit(tx) or _klass(tx) != "unknown" or tx.merchant_name:
            continue
        if tx.amount <= 0 or (typical > 0 and tx.amount >= typical):
            continue
        if _is_eating_out(tx) or _is_delivery(tx) or _is_ride(tx) or _is_cash(tx):
            continue
        if _CARD_REFERENCE.search(tx.description or ""):
            continue
        # "POS Purchase" is a card purchase even when the card number sits in another column.
        if re.search(r"\b(?:pos purchase|fuel purchase|card purchase|online purchase)\b", tx.description or "", re.IGNORECASE):
            continue
        if (tx.description or "").strip().casefold() == "no description printed":
            continue
        key = _unexplained_key(tx)
        if len(key) < 4:
            continue
        by_key[key].append(tx)
    findings: list[ReviewFinding] = []
    for key, rows in by_key.items():
        rows.sort(key=lambda tx: tx.transaction_date)
        # A system debit repeats its amount; a shop's purchases vary.
        commonest = Counter(tx.amount for tx in rows).most_common(1)[0][1]
        if commonest * 5 < len(rows) * 3:
            continue
        window = timedelta(days=UNEXPLAINED_WINDOW_DAYS)
        clustered = any(
            rows[index + UNEXPLAINED_MIN_REPEATS - 1].transaction_date - rows[index].transaction_date
            <= window
            for index in range(len(rows) - UNEXPLAINED_MIN_REPEATS + 1)
        )
        if not clustered:
            continue
        total = sum((tx.amount for tx in rows), _ZERO)
        amounts = sorted({tx.amount for tx in rows})
        amount_text = (
            money(amounts[0]) if len(amounts) == 1 else f"{money(amounts[0])} to {money(amounts[-1])}"
        )
        first, last = rows[0].transaction_date, rows[-1].transaction_date
        findings.append(
            ReviewFinding(
                key=f"unexplained_debits:{key}",
                group="review",
                leak_type="unknown_recurring_payment",
                title=f'Repeated small debits "{key.title()}"',
                display="table",
                shows=(
                    f"{len(rows)} debits of {amount_text} between {first:%d %b} and {last:%d %b}, "
                    f"{money(total)} in all."
                ),
                cannot_show="What this is: the wording is a reference, not a merchant. The bank can say.",
                figures={"total": total, "count": len(rows), "label": key},
                rows=evidence_rows(rows, "charge"),
            )
        )
    findings.sort(key=lambda item: -Decimal(str(item.figures["total"])))
    return findings


def balance_findings(txs: list[FeatureTransaction]) -> ReviewFinding | None:
    """Days the balance went below zero or under the floor, from the printed balances.

    Only statements that print a running balance can show this. One low row is normal before
    pay day; a run of them, or an overdrawn day, is the pattern worth seeing.
    """
    with_balance = [tx for tx in txs if tx.balance is not None and tx.transaction_date]
    if not with_balance:
        return None
    floor = typical_purchase(txs)
    overdrawn = [tx for tx in with_balance if tx.balance < 0]
    low = [tx for tx in with_balance if 0 <= tx.balance < floor]
    low_days = {tx.transaction_date for tx in low}
    if not overdrawn and len(low_days) < LOW_BALANCE_MIN_DAYS:
        return None
    sentences: list[str] = []
    if overdrawn:
        worst = min(overdrawn, key=lambda tx: tx.balance)
        days = sorted({tx.transaction_date for tx in overdrawn})
        listed = _join([f"{day:%d %b}" for day in days[:4]])
        more = " and more" if len(days) > 4 else ""
        sentences.append(
            f"Overdrawn on {listed}{more} (lowest {_signed_money(worst.balance)} on {worst.transaction_date:%d %b})."
        )
        after = [
            tx
            for tx in txs
            if _klass(tx) == "bank_fee"
            and _is_debit(tx)
            and any(0 <= (tx.transaction_date - day).days <= 2 for day in days)
        ]
        fee_total = sum((tx.amount for tx in after), _ZERO)
        if fee_total > 0:
            sentences.append(f"Bank charges in the two days after: {money(fee_total)}.")
    if low:
        sentences.append(
            f"Balance below a typical purchase ({money(_whole(floor))}) on {len(low)} rows "
            f"across {len(low_days)} days."
        )
    rows = [*overdrawn, *low]
    return ReviewFinding(
        key="balance:ran_out",
        group="review",
        leak_type="high_cost_credit_leak",
        title="Balance ran out",
        display="table",
        shows=" ".join(sentences),
        cannot_show="Whether money sat in another account at the time.",
        figures={
            "overdrawn_days": len({tx.transaction_date for tx in overdrawn}),
            "low_rows": len(low),
            "low_days": len(low_days),
            "floor": floor,
            "lowest": min(tx.balance for tx in with_balance),
        },
        rows=evidence_rows(rows, "balance"),
    )
