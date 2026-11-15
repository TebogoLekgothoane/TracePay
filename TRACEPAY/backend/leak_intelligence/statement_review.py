"""A plain-language review of a customer's statements: what the rows show and what they cannot.

This is the report layer. It reads the customer's consolidated transactions and works out,
from the rows alone, the findings a person would look for by hand: a debit order that
doubled, the same charge made twice, a price that moved, fees by source, borrowing cost,
money that leaves and comes straight back, and where the month's money goes.

Every finding keeps three things apart, as the rest of TracePay does:

* ``confirmed``: facts the rows show outright (a count, an amount, a date);
* ``possible``: what the pattern only suggests;
* ``cannot_see``: what a bank statement does not contain, so a claim is never read as proof.

Findings fall into the same honest groups as the leak engine (recoverable, review,
commitment) plus ``good_news`` for a price that fell. Nothing here adds the groups into one
"money lost" figure.
"""

from __future__ import annotations

import calendar
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
from typing import Literal

from .finding_questions import _options, question_key
from .leak_models import FindingQuestion, QuestionOption
from .models import FeatureTransaction

Group =Literal["recoverable", "review", "commitment", "good_news"]

_ZERO = Decimal("0")
_CENT = Decimal("0.01")

# ----------------------------------------------------------------------------- context


@dataclass(frozen=True)
class StatementContext:
    """Figures printed on the statements themselves, which transaction rows do not carry.

    Every field is optional. A sentence that needs one is left out when it is missing, so
    the report never states a rate, a limit or a reconciliation it was not given.
    """

    account_label: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    # Debit interest rate (percent) by statement month, "YYYY-MM".
    debit_interest_rates: dict[str, Decimal] = field(default_factory=dict)
    credit_interest_rate: Decimal | None = None
    facility: Decimal | None = None
    # A credit card's limit, printed on card statements. Set, with no facility, means a card.
    credit_limit: Decimal | None = None
    # What each statement's own summary says it charged, "YYYY-MM" -> amount.
    statement_fee_totals: dict[str, Decimal] = field(default_factory=dict)
    statement_interest_totals: dict[str, Decimal] = field(default_factory=dict)
    # Card purchases per statement month, from the statement summary.
    card_purchases: dict[str, Decimal] = field(default_factory=dict)
    # Total money out (card + online payments + interest + fees) and money in (deposits +
    # interest received) per statement month, from the summary. Only months whose summary
    # printed the two lines every statement carries.
    statement_debit_totals: dict[str, Decimal] = field(default_factory=dict)
    statement_credit_totals: dict[str, Decimal] = field(default_factory=dict)


def _printed_decimal(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except Exception:  # noqa: BLE001 - a malformed stored figure is simply not used
        return None
    return number if number.is_finite() else None


def context_from_printed_figures(
    rows: list[dict[str, object]], account_label: str | None = None
) -> StatementContext:
    """Build the context from figures stored with each imported statement.

    Each row is one statement: ``{"account_id": ..., "printed_figures": {...}}``. Figures
    are used only when every statement that has them belongs to one account, because the
    rate, the limit and the summary totals differ between accounts and must never be mixed.
    A statement with no printed figures adds nothing.
    """
    usable = []
    for row in rows:
        figures = row.get("printed_figures")
        if not isinstance(figures, dict):
            continue
        raw_date = figures.get("statement_date")
        try:
            statement_date = date.fromisoformat(str(raw_date)) if raw_date else None
        except ValueError:
            statement_date = None
        if statement_date is None:
            continue
        usable.append((statement_date, row.get("account_id"), figures))
    if not usable or len({account for _, account, _ in usable}) != 1:
        return StatementContext(account_label=account_label)
    usable.sort(key=lambda item: item[0])

    rates: dict[str, Decimal] = {}
    fees: dict[str, Decimal] = {}
    interest: dict[str, Decimal] = {}
    cards: dict[str, Decimal] = {}
    money_out: dict[str, Decimal] = {}
    money_in: dict[str, Decimal] = {}
    for statement_date, _account, figures in usable:
        key = _month_key(statement_date)
        # A summary prints the lines that have an amount, so an absent line is none. That is
        # only safe when the two lines every statement carries were read.
        online = _printed_decimal(figures.get("online_payments"))
        deposits = _printed_decimal(figures.get("deposits_received"))
        if online is not None and deposits is not None:
            def part(name: str) -> Decimal:
                return _printed_decimal(figures.get(name)) or _ZERO

            money_out[key] = online + part("card_purchases") + part("interest_paid") + part("fees_total")
            money_in[key] = deposits + part("interest_received")
        if (rate := _printed_decimal(figures.get("debit_interest_rate"))) is not None:
            rates[key] = rate
        if (total := _printed_decimal(figures.get("fees_total"))) is not None:
            fees[key] = total
        if (paid := _printed_decimal(figures.get("interest_paid"))) is not None:
            interest[key] = paid
        if (spent := _printed_decimal(figures.get("card_purchases"))) is not None:
            cards[key] = spent
    latest = usable[-1][2]
    first_month = usable[0][0]
    last_day = calendar.monthrange(first_month.year, first_month.month)[1]
    if first_month.day == last_day:
        # A calendar-month statement: it starts on the first of its month.
        period_start = date(first_month.year, first_month.month, 1)
    else:
        # A cycle that ends mid-month (say on the 4th) began the day after the previous
        # month's statement date, so the earliest statement still covers a whole month.
        previous_month = first_month.month - 1 or 12
        previous_year = first_month.year - (1 if first_month.month == 1 else 0)
        previous_last = calendar.monthrange(previous_year, previous_month)[1]
        period_start = date(previous_year, previous_month, min(first_month.day, previous_last)) + timedelta(days=1)
    return StatementContext(
        account_label=account_label,
        # Statements are monthly: the period runs from the start of the earliest
        # statement's cycle to the last statement date.
        period_start=period_start,
        period_end=usable[-1][0],
        debit_interest_rates=rates,
        credit_interest_rate=_printed_decimal(latest.get("credit_interest_rate")),
        facility=_printed_decimal(latest.get("facility")),
        credit_limit=_printed_decimal(latest.get("credit_limit")),
        statement_fee_totals=fees,
        statement_interest_totals=interest,
        card_purchases=cards,
        statement_debit_totals=money_out,
        statement_credit_totals=money_in,
    )


# ----------------------------------------------------------------------------- output


@dataclass(frozen=True)
class EvidenceRow:
    """One statement row a finding is built from, so any figure can be checked against it."""

    transaction_id: str
    date: date
    description: str
    amount: Decimal
    direction: Literal["debit", "credit"]
    # What the row is to this finding: "charge", "repeat", "doubled", "out", "back", ...
    role: str = "charge"


# A finding built from hundreds of rows lists this many; the rest are counted, never hidden.
MAX_EVIDENCE_ROWS = 80


def evidence_row(tx: FeatureTransaction, role: str = "charge") -> EvidenceRow:
    return EvidenceRow(
        transaction_id=tx.transaction_id,
        date=tx.transaction_date,
        description=tx.description or "",
        amount=tx.amount,
        direction="debit" if tx.transaction_type == "debit" else "credit",
        role=role,
    )


def evidence_rows(txs: list[FeatureTransaction], role: str = "charge") -> list[EvidenceRow]:
    return [evidence_row(tx, role) for tx in txs]


@dataclass
class ReviewFinding:
    key: str
    group: Group
    leak_type: str
    title: str
    # How it is shown: a card, a row of the review table, or a one-line item.
    display: Literal["card", "table", "item"]
    confidence: str = ""
    confirmed: list[str] = field(default_factory=list)
    possible: list[str] = field(default_factory=list)
    cannot_see: list[str] = field(default_factory=list)
    check: str | None = None
    # Table rows: the two cells the table shows.
    shows: str = ""
    cannot_show: str = ""
    type_note: str = ""
    # One-line items carry their whole sentence here.
    line: str = ""
    # Machine-readable numbers behind the wording.
    figures: dict[str, object] = field(default_factory=dict)
    # Questions whose answer could change this finding. Answered ones are removed later.
    questions: list[FindingQuestion] = field(default_factory=list)
    # What the user told us, kept apart from what the rows show.
    reported: list[str] = field(default_factory=list)
    # A finding the user's answer explained is set aside, with a note under "not raised".
    status: Literal["active", "dismissed", "resolved"] = "active"
    # The statement rows behind the figures, oldest first. ``rows_total`` counts them all, so
    # a long list that was cut says how many were left out.
    rows: list[EvidenceRow] = field(default_factory=list)
    rows_total: int = 0

    def __post_init__(self) -> None:
        self.set_rows(self.rows)

    def set_rows(self, rows: list[EvidenceRow]) -> None:
        ordered = sorted(rows, key=lambda row: (row.date, row.transaction_id))
        self.rows_total = len(ordered)
        self.rows = ordered[:MAX_EVIDENCE_ROWS]


def slug(text: str) -> str:
    """A question subject: lowercase letters, digits and hyphens only."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "item"


def ask(
    finding_key: str,
    leak_type: str,
    kind: str,
    subject: str,
    name: str,
    prompt: str,
    why: str,
    *,
    context: list[str] | None = None,
    signature: str = "",
    options=None,
) -> FindingQuestion:
    """One question about one finding, built the way the leak engine builds its own."""
    return FindingQuestion(
        question_key=question_key(kind, slug(subject)),
        kind=kind,  # type: ignore[arg-type]
        leak_id=finding_key,
        leak_type=leak_type,
        subject=name,
        prompt=prompt,
        why_asked=why,
        context=context or [],
        options=options or _options(kind),
        signature=signature,
    )


@dataclass
class Commitment:
    name: str
    amount: str


@dataclass
class StatementReview:
    account_label: str
    period_start: date | None
    period_end: date | None
    transaction_count: int
    month_count: int
    account_count: int
    facility: Decimal | None
    reconciliation: str | None
    findings: list[ReviewFinding]
    commitments: list[Commitment]
    context_notes: list[str]
    near_misses: list[str]
    coverage_limits: list[str]
    # Every question still open, strongest first, and the few to put to the user now.
    questions: list[FindingQuestion] = field(default_factory=list)
    pending_questions: list[FindingQuestion] = field(default_factory=list)
    questions_not_shown: int = 0
    # False when the user's earlier answers could not be read: nothing is asked then,
    # because guessing which questions were already answered would repeat them.
    questions_asked: bool = True

    def by_group(self, group: Group) -> list[ReviewFinding]:
        """The findings in a group that the user's answers have not set aside."""
        return [item for item in self.findings if item.group == group and item.status == "active"]


# ----------------------------------------------------------------------------- helpers

_MONTH_FULL = list(calendar.month_name)
_MONTH_ABBR = list(calendar.month_abbr)
_NUMBER_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight"}

_LOCATION_TAIL = re.compile(
    r"\s+(?:CAPE\s*TOWN|JOHANNESBURG|DURBAN|EAST\s+LONDON|MILNERTON|CLAREMONT|GARDENS|SANDTON|"
    r"LONDON|NEW\s+YORK|CORK|WESTERN\s+CAPE|NL|GB|US|IE|ZA)\b.*$",
    re.IGNORECASE,
)
_PROCESSOR_PREFIX = re.compile(r"^(?:yoco|s2s|tst|dl|smc|paystack|fixr|mta)\s*\*\s*", re.IGNORECASE)

# Known billing names. The first match wins; the value is how the customer would say it.
_ALIASES: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(pattern, re.IGNORECASE), name)
    for pattern, name in (
        (r"^apple\.com", "Apple"),
        (r"^google", "Google One"),
        (r"microsoft", "Microsoft"),
        (r"godaddy", "GoDaddy"),
        (r"virgin\s*act", "Virgin Active"),
        (r"pineapple", "Pineapple"),
        (r"outsurance", "Outsurance"),
        (r"dotsure", "Dotsure"),
        (r"mobicred", "Mobicred"),
        (r"telkom", "Telkom"),
        (r"anthropic", "Anthropic Claude"),
        (r"discbank", "Discbank"),
        # After delivery matching, so "Uber Eats" stays a delivery and a ride stays a ride.
        (r"\buber\b", "Uber"),
        (r"\bbolt\b", "Bolt"),
    )
)
# Restaurant and takeaway delivery services, by how their orders appear on a statement. A
# supermarket's own delivery (Checkers Sixty60, say) is a grocery shop, not a delivery habit.
# A bank prefix such as "DL UBER CPT" is a ride. It is delivery only when the line says Eats.
_DELIVERY_SERVICES: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(pattern, re.IGNORECASE), name)
    for pattern, name in (
        (r"uber\s*eats", "Uber Eats"),
        (r"\bmr\.?\s*d(?:\s+food)?\b|\bmrd(?:\s*food)?\b", "Mr D Food"),
        (r"\bbolt\s*food|\bboltfood", "Bolt Food"),
        (r"\border\s*in\b|\borderin\b", "OrderIn"),
        (r"\bdeliveroo\b", "Deliveroo"),
    )
)


def delivery_service(description: str | None) -> str | None:
    """The delivery service a statement line is an order from, or None."""
    for pattern, name in _DELIVERY_SERVICES:
        if pattern.search(description or ""):
            return name
    return None
_PLATFORM_BILLING = re.compile(r"\.com/bill|itunes|google\s*play", re.IGNORECASE)
_INSURERS = (
    "outsurance", "dotsure", "pineapple", "discovery insure", "king price", "miway", "santam",
    "hollard", "momentum", "old mutual", "sanlam", "budget insurance", "1st for women",
    "auto & general", "telesure", "virseker", "youi", "bryte",
)
_TELECOMS = ("telkom", "vodacom", "mtn", "cell c", "rain ", "afrihost", "vox")
_LENDERS = ("bank", "cred", "finance", "loan", "discbank")
_DOMAIN_HOSTS = ("godaddy", "namecheap", "xneelo", "afrihost")
_CLOUD = ("Google One", "Microsoft", "Apple")
_TRIP_CITIES = ("new york", "london", "dubai", "paris", "amsterdam", "bangkok", "lisbon", "rome")
# What a bank charges for holding and running the account itself. A recurring bank charge
# that is none of these (and not interest, a penalty or a payment fee) is something the
# customer may have chosen, so it is raised on its own and the customer is asked about it.
_UPKEEP = re.compile(
    r"account|acc\b|service|admin|facilit|monthly\s+fee|card\s+fee|notif|\bsms\b|statement|"
    r"maintenance|management|annual|licen[cs]e|bank\s+(?:fee|charge)|banking|internet|online|"
    r"cellphone|mobile|\bapp\b",
    re.IGNORECASE,
)
# What a product the customer signed up for tends to be called. A charge must read like one
# (as well as repeat monthly) before it is raised as a choice: "anything not known to be
# ordinary" would raise every fee wording a bank has, and a wrong finding costs trust.
_OPTIONAL_SIGNAL = re.compile(
    r"premium|reward|member|programme|\bprogram\b|\bcover\b|covered|insur|assurance|\bplan\b|"
    r"package|bundle|subscri|\bclub\b|benefit|protect|\blife\b|funeral|loyalty|concierge|"
    r"lounge|wellness|vitality|greenbacks|ebucks",
    re.IGNORECASE,
)
# A penalty, or a fee for how the account is used (abroad, for cash, per transaction), which
# repeats because the usage does, not because the customer signed up for something.
_PENALTY = re.compile(
    r"overdraft|interest|penalt|unpaid|returned|rejected|dishono|insufficient|exceed|\blate\b|"
    r"cross.?border|forex|foreign|international|overseas|abroad|currency|conversion|"
    r"transaction|\bcash\b|swipe|purchase|enquiry|inquiry|\bbalance\b|\bdeposit\b|withdraw|declined|replacement|"
    r"\bnsf\b|debit\s+order|send\s*money|cash\s*send|\bvas\b|e-?wallet|pay\s*shap|voucher|airtime|prepaid",
    re.IGNORECASE,
)
# A fee on a payment or transfer, as opposed to a charge for holding the account.
_PAYMENT_FEE = re.compile(
    r"payment|faster|shap|\(fp\)|\bfp\b|transfer|\beft\b|immediate|withdraw|\batm\b|enquiry|cash\s*sent|cash\s*send",
    re.IGNORECASE,
)
_FOREIGN_CURRENCY = re.compile(r"\b(USD|EUR|GBP)\s?(\d+(?:\.\d+)?)", re.IGNORECASE)


def money(value: Decimal | int | float | str) -> str:
    amount = Decimal(str(value)).quantize(_CENT, rounding=ROUND_HALF_UP)
    text = f"{amount:,.2f}"
    return "R" + (text[:-3] if text.endswith(".00") else text)


def money_list(values: list[Decimal]) -> str:
    """Prices side by side: if any has cents, all show cents, so they line up."""
    cents = any(Decimal(str(v)) % 1 != 0 for v in values)
    if not cents:
        return _join([money(v) for v in values])
    return _join([f"R{Decimal(str(v)).quantize(_CENT, rounding=ROUND_HALF_UP):,.2f}" for v in values])


def _kilo(value: Decimal, places: int = 0) -> str:
    quant = Decimal(1).scaleb(-places)
    return f"R{(value / 1000).quantize(quant, rounding=ROUND_HALF_UP)}k"


def _round_to(value: Decimal, step: int) -> Decimal:
    return (value / step).quantize(Decimal(1), rounding=ROUND_HALF_UP) * step


def _ordinal(day: int) -> str:
    suffix = "th" if 10 <= day % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"


def _month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def _join(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _short_date(day: date) -> str:
    return f"{day.day} {_MONTH_ABBR[day.month]}"


def _long_date(day: date) -> str:
    return f"{day.day} {_MONTH_ABBR[day.month]} {day.year}"


def _is_debit(tx: FeatureTransaction) -> bool:
    return tx.transaction_type == "debit"


def _klass(tx: FeatureTransaction) -> str:
    return tx.categorisation.transaction_class


def _clean_description(description: str) -> str:
    text = _LOCATION_TAIL.sub("", description).strip()
    text = re.sub(r"\b\d{5,}\b", "", text)
    text = re.sub(r"\b[A-Z]\d[A-Z0-9]{4,}\b", "", text)
    text = re.sub(r"\s+(?:USD|EUR|GBP)\s?\d+(?:\.\d+)?", "", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip(" -*")


def unreadable_description(tx: FeatureTransaction) -> bool:
    """The placeholder left when a cell had an amount but no narration."""
    return (tx.description or "").strip().casefold() == "no description printed"


def payee_name(tx: FeatureTransaction) -> str:
    """How the customer would name who was paid. Stable across a payee's own spellings."""
    description = tx.description or ""
    if unreadable_description(tx):
        return ""
    if service := delivery_service(description):
        return service
    # "Rent A Car" and rentals are hire companies, not a landlord.
    if re.search(r"landlord|\brent\b(?!\s+a\s+car)", description, re.IGNORECASE) and _is_debit(tx):
        return "Rent"
    for pattern, name in _ALIASES:
        if pattern.search(description):
            return name
    if tx.merchant_name and not re.search(r"\d", tx.merchant_name):
        return tx.merchant_name
    cleaned = _PROCESSOR_PREFIX.sub("", _clean_description(description))
    return cleaned.title() if cleaned else (description or "Unknown")


def _statement_text(tx: FeatureTransaction) -> str:
    """The payee as the statement spells it, without the place it was bought."""
    return _clean_description(tx.description or "")


def _amounts_equal(left: Decimal, right: Decimal) -> bool:
    return abs(left - right) <= Decimal("0.005")


_CARD_PURCHASE = re.compile(
    r"\b(?:online purchase|card purchase|recurring card purchase)\b",
    re.IGNORECASE,
)


def _purchase_labelled_as_fee(tx: FeatureTransaction) -> bool:
    """A card or online purchase whose class was set to a fee.

    The fee column and a fee charged at the same merchant must not turn the
    purchase itself into a bank fee. A real fee says so in the description.
    """
    description = tx.description or ""
    return (
        _klass(tx) == "bank_fee"
        and _is_debit(tx)
        and _CARD_PURCHASE.search(description) is not None
        and re.search(r"\bfee\b", description, re.IGNORECASE) is None
    )


def _is_fee(tx: FeatureTransaction) -> bool:
    return _klass(tx) == "bank_fee" and _is_debit(tx) and not _purchase_labelled_as_fee(tx)


_DEBIT_INTEREST = re.compile(r"\bint(?:erest)?\s+on\s+debit\b", re.IGNORECASE)


def _is_interest(tx: FeatureTransaction) -> bool:
    text = tx.description or ""
    return _is_fee(tx) and ("interest" in text.lower() or _DEBIT_INTEREST.search(text) is not None)


# Money the bank paid back against interest it had charged. The wording differs by bank
# ("interest cashback", "interest rebate"); the shape is a credit that names both.
_INTEREST_BACK = re.compile(
    r"interest.{0,24}(?:cash\s*back|cashback|rebate|refund)"
    r"|(?:cash\s*back|cashback|rebate).{0,24}interest",
    re.IGNORECASE,
)


def _is_interest_rebate(tx: FeatureTransaction) -> bool:
    return not _is_debit(tx) and _INTEREST_BACK.search(tx.description or "") is not None


def _optional_charge_series(txs: list[FeatureTransaction]) -> dict[str, list[FeatureTransaction]]:
    """Bank charges that repeat monthly and are not the account's own upkeep.

    Judged from how the charge behaves and what it is called, never from a merchant list: the
    same charge for two or more months, at one amount, named like a product the customer
    chose (a premium, rewards, cover, a plan) and not interest, a penalty, a payment fee or
    ordinary account upkeep.
    """
    groups: dict[str, list[FeatureTransaction]] = defaultdict(list)
    for tx in txs:
        description = tx.description or ""
        if (
            _is_fee(tx)
            and not _is_interest(tx)
            and _OPTIONAL_SIGNAL.search(description)
            and not _PAYMENT_FEE.search(description)
            and not _UPKEEP.search(description)
            and not _PENALTY.search(description)
        ):
            groups[re.sub(r"\s+", " ", description.strip().lower())].append(tx)
    series: dict[str, list[FeatureTransaction]] = {}
    for name, items in groups.items():
        months = {_month_key(tx.transaction_date) for tx in items}
        amounts = {tx.amount for tx in items}
        if len(months) >= 2 and len(items) == len(months) and len(amounts) == 1:
            series[name] = sorted(items, key=lambda tx: tx.transaction_date)
    return series


def _is_service_charge(tx: FeatureTransaction) -> bool:
    return _is_fee(tx) and "service charge" in (tx.description or "").lower()


def _is_cross_border(tx: FeatureTransaction) -> bool:
    return _is_fee(tx) and (tx.description or "").lower().startswith("cross-border")


_RENT_WORDS = re.compile(r"landlord|\brent\b", re.IGNORECASE)


def _purchases(txs: list[FeatureTransaction]) -> list[FeatureTransaction]:
    """Debits that are spending on something, never fees or transfers.

    Payments to people are left out, except rent: it is paid to a person but it is a
    monthly commitment like any other.
    """
    return [
        tx
        for tx in txs
        if _is_debit(tx)
        and tx.transaction_date
        and (
            _klass(tx) in {"spending", "unknown"}
            or _purchase_labelled_as_fee(tx)
            or (_klass(tx) == "person_to_person" and _RENT_WORDS.search(tx.description or ""))
        )
        and not unreadable_description(tx)
    ]


@dataclass
class _Series:
    name: str
    charges: list[FeatureTransaction]

    @property
    def months(self) -> list[str]:
        return sorted({_month_key(tx.transaction_date) for tx in self.charges if tx.transaction_date})

    @property
    def latest(self) -> FeatureTransaction:
        return max(self.charges, key=lambda tx: tx.transaction_date)

    @property
    def regular_amount(self) -> Decimal:
        counts = Counter(tx.amount for tx in self.charges)
        top = max(counts.values())
        winners = [amount for amount, count in counts.items() if count == top]
        latest_first = sorted(self.charges, key=lambda tx: tx.transaction_date, reverse=True)
        for tx in latest_first:
            if tx.amount in winners:
                return tx.amount
        return self.charges[0].amount


def _series_by_payee(txs: list[FeatureTransaction]) -> dict[str, _Series]:
    grouped: dict[str, list[FeatureTransaction]] = defaultdict(list)
    for tx in _purchases(txs):
        name = payee_name(tx)
        if name:
            grouped[name].append(tx)
    result = {}
    for name, charges in grouped.items():
        charges.sort(key=lambda tx: tx.transaction_date)
        result[name] = _Series(name, charges)
    return result


def _is_monthly(series: _Series, minimum_months: int = 3) -> bool:
    """Charged in at least ``minimum_months`` calendar months, about once a month."""
    months = series.months
    if len(months) < minimum_months:
        return False
    return len(series.charges) <= len(months) * 2


def _consecutive(months: list[str]) -> list[str]:
    """Every calendar month from the first to the last, whether charged or not."""
    first_year, first_month = (int(part) for part in months[0].split("-"))
    last_year, last_month = (int(part) for part in months[-1].split("-"))
    out = []
    year, month = first_year, first_month
    while (year, month) <= (last_year, last_month):
        out.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return out


def _month_name(key: str, *, full: bool = True) -> str:
    return (_MONTH_FULL if full else _MONTH_ABBR)[int(key.split("-")[1])]


def _month_span(keys: list[str]) -> str:
    return f"{_month_name(keys[0], full=False)}–{_month_name(keys[-1], full=False)}"


# ----------------------------------------------------------------------------- detectors


def _is_whole_multiple(big: Decimal, small: Decimal) -> bool:
    if small <= 0 or big <= small:
        return False
    multiple = big / small
    rounded = multiple.quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return rounded in (2, 3) and abs(multiple - rounded) <= Decimal("0.01")


def _double_debit(series_map: dict[str, _Series]) -> list[ReviewFinding]:
    """A regular monthly debit that is later taken as exactly twice or three times the amount.

    Missed months billed together look the same, so this is raised only when no earlier
    month went unpaid. A skipped month is the ordinary explanation and is not raised.
    """
    findings = []
    for name, series in series_map.items():
        if len(series.months) < 4:
            continue
        regular = series.regular_amount
        if regular < Decimal("50"):
            continue
        for charge in series.charges:
            multiple = charge.amount / regular
            rounded = multiple.quantize(Decimal(1), rounding=ROUND_HALF_UP)
            if rounded not in (2, 3) or abs(multiple - rounded) > Decimal("0.01"):
                continue
            month = _month_key(charge.transaction_date)
            # The ordinary amount has to have been charged in each earlier month.
            # A shop that was merely visited in those months, at other prices, was not doubled.
            regular_months = {
                _month_key(tx.transaction_date)
                for tx in series.charges
                if tx.amount == regular and tx.transaction_date
            }
            earlier = [key for key in sorted(regular_months) if key < month]
            if len(earlier) < 3:
                continue
            span = _consecutive(earlier)
            if any(key not in regular_months for key in span):
                continue  # a month was missed: billed together, not a double debit
            if _consecutive([earlier[-1], month])[1:-1]:
                continue
            regulars = [tx for tx in series.charges if tx.amount == regular and _month_key(tx.transaction_date) < month]
            day = Counter(tx.transaction_date.day for tx in regulars).most_common(1)[0][0]
            extra = regular * (int(rounded) - 1)
            findings.append(
                ReviewFinding(
                    key=f"double_debit:{name}",
                    group="recoverable",
                    leak_type="duplicate_debit_order_leak",
                    title=f"{name} charged double on {_short_date(charge.transaction_date)}",
                    display="card",
                    confidence="medium",
                    confirmed=[
                        f"{money(regular)} was debited on the {_ordinal(day)} of every month from "
                        f"{_month_name(earlier[0])} to {_month_name(earlier[-1])}. On "
                        f"{_short_date(charge.transaction_date)} it was **{money(charge.amount)}, "
                        f"exactly {int(rounded)}×**."
                    ],
                    possible=[
                        "a duplicate debit or a price change. A catch-up payment is unlikely, "
                        "because no earlier month was missed."
                    ],
                    check=(
                        f"ask {name} for the {_month_name(month)} debit-order breakdown. Up to "
                        f"{money(extra)} may be recoverable."
                    ),
                    figures={"regular": regular, "charged": charge.amount, "extra": extra},
                    rows=[
                        evidence_row(tx, "doubled" if tx is charge else "regular")
                        for tx in series.charges
                        if _month_key(tx.transaction_date) <= month
                    ],
                )
            )
    return findings


def _pair_rows(series: _Series, paired: dict[Decimal, dict[str, list[date]]]) -> list[EvidenceRow]:
    """The charges that make up each pair: the first of a pair is the charge, the rest repeat it."""
    rows: list[EvidenceRow] = []
    seen: set[tuple[Decimal, str]] = set()
    for tx in series.charges:
        month = _month_key(tx.transaction_date)
        if month not in paired.get(tx.amount, {}) or tx.transaction_date not in paired[tx.amount][month]:
            continue
        first = (tx.amount, month) not in seen
        seen.add((tx.amount, month))
        rows.append(evidence_row(tx, "charge" if first else "repeat"))
    return rows


_EVERYDAY_REPEAT = frozenset(
    {
        "groceries",
        "fuel",
        "fast food",
        "restaurants",
        "takeaways",
        "ride hailing",
        "transport",
        "airtime & data",
        "airtime",
        "cellphone",
    }
)


_EVERYDAY_TEXT = re.compile(
    r"\b(?:prepaid|airtime|electricity|data bundle)\b",
    re.IGNORECASE,
)


def _looks_like_a_ride(tx: FeatureTransaction) -> bool:
    """A ride-hailing fare. The same fare twice is two trips, not a second subscription."""
    raw = f"{tx.merchant_name or ''} {tx.description or ''}".upper()
    compact = raw.replace(" ", "").replace("-", "").replace("*", "")
    if "UBEREATS" in compact or "BOLT.EU/S/" in compact:
        return False
    tokens = raw.replace("-", " ").replace("*", " ").split()
    return "UBER" in tokens or "BOLT" in tokens


def _everyday_repeat(series: _Series) -> bool:
    """Groceries, rides, fuel and airtime repeat the same small price on purpose."""
    charges = series.charges
    if not charges:
        return False
    ordinary = 0
    for tx in charges:
        category = (tx.categorisation.category_name or "").casefold()
        if category in _EVERYDAY_REPEAT or _looks_like_a_ride(tx) or _EVERYDAY_TEXT.search(tx.description or ""):
            ordinary += 1
    return ordinary * 2 >= len(charges)


def _paired_charges(series_map: dict[str, _Series], fee_rate_by_payee: dict[str, Decimal]) -> list[ReviewFinding]:
    """The same amount charged twice within a few days, month after month.

    A shop visited twice in three days can be two ordinary trips. A subscription billed
    twice in the same week, for several months, is a second account or device.
    """
    findings = []
    for name, series in series_map.items():
        subscription = any(
            (tx.categorisation.category_name or "").casefold() == "subscriptions" for tx in series.charges
        )
        limit = 7 if subscription else 3
        by_amount_month: dict[tuple[Decimal, str], list[date]] = defaultdict(list)
        for tx in series.charges:
            by_amount_month[(tx.amount, _month_key(tx.transaction_date))].append(tx.transaction_date)
        paired: dict[Decimal, dict[str, list[date]]] = defaultdict(dict)
        for (amount, month), days in by_amount_month.items():
            days.sort()
            # Exactly two. Three or more of the same price in a few days is repeat buying.
            if len(days) == 2 and (days[-1] - days[0]).days <= limit:
                paired[amount][month] = days
        paired = {amount: months for amount, months in paired.items() if len(months) >= 2}
        if not paired:
            continue
        # A shop, a ride, or airtime at the same price is an ordinary repeat, not a second account.
        # A payee with other charges (Apple sells many things) can still be billed twice.
        if _everyday_repeat(series):
            continue
        months = sorted({month for by_month in paired.values() for month in by_month})
        if len(months) < 2:
            continue
        pair_count = sum(len(by_month) for by_month in paired.values())
        extra = _ZERO
        for amount, by_month in paired.items():
            for days in by_month.values():
                extra += amount * (len(days) - 1)
        amounts = sorted(paired)
        gaps = [(days[-1] - days[0]).days for by_month in paired.values() for days in by_month.values() if len(days) >= 2]
        span_phrase = "within a week" if gaps and max(gaps) > 3 else "within 3 days"
        all_days = [day.day for by_month in paired.values() for days in by_month.values() for day in days]
        last_pair_day = max(day for by_month in paired.values() for days in by_month.values() for day in days)
        rate = fee_rate_by_payee.get(name)
        fee_text = (
            f" plus about {money((extra * rate / 100).quantize(_CENT))} in cross-border fees" if rate else ""
        )
        after = [key for key in series.months if key > months[-1]]
        single_after = [
            key
            for key in after
            if all(len(by_amount_month.get((amount, key), [])) == 1 for amount in amounts)
        ]
        tail = ""
        if single_after:
            tail = f" From {_month_name(single_after[0])} there is {'one of each' if len(amounts) > 1 else 'one'}."
        spans = f"{_ordinal(min(all_days))}–{_ordinal(max(all_days))}"
        window = "in each of " + _join([_month_name(key) for key in months]) if len(months) > 2 else "in " + _join([_month_name(key) for key in months])
        findings.append(
            ReviewFinding(
                key=f"paired:{name}",
                group="recoverable",
                leak_type="duplicate_payment_leak",
                title=f"{name} charged the same amounts twice, {_month_span(months)}",
                display="card",
                confidence="medium-low",
                confirmed=[
                    f"{window}, {money_list(amounts)} {'were each' if len(amounts) > 1 else 'was'} charged "
                    f"**twice {span_phrase}** around the {spans}. That is {pair_count} pairs, with "
                    f"{money(extra)} in repeats{fee_text}.{tail}"
                ],
                cannot_see=[
                    f"whether these are two {name} IDs or family devices."
                    if name == "Apple"
                    else f"whether these are two accounts or devices on the same {name} billing."
                ],
                check=(
                    'Apple purchase history, then "Report a problem".'
                    if name == "Apple"
                    else f"the {name} purchase history for the dates shown."
                ),
                figures={"pairs": pair_count, "extra": extra, "amounts": amounts, "months": months},
                rows=_pair_rows(series, paired),
                questions=[
                    ask(
                        f"paired:{name}",
                        "duplicate_payment_leak",
                        "duplicate_expected",
                        name,
                        name,
                        f"Were both {name} {' / '.join(money(a) for a in amounts)} charges expected, "
                        + (f"for example two {name} IDs?" if name == "Apple" else "for example two accounts?"),
                        "This helps tell a real duplicate from a legitimate second charge, so only genuine ones are flagged.",
                        signature=f"d={last_pair_day.isoformat()}",
                    )
                ],
            )
        )
    return findings


def _price_changes(series_map: dict[str, _Series]) -> tuple[list[ReviewFinding], list[ReviewFinding]]:
    """A steady monthly amount that moves to a new steady amount. Rises to review, drops as good news."""
    rises, drops = [], []
    for name, series in series_map.items():
        if len(series.months) < 4 or len(series.charges) > len(series.months) * 1.5:
            continue
        amounts = [tx.amount for tx in series.charges]
        runs: list[list[Decimal]] = []
        for amount in amounts:
            if runs and runs[-1][0] == amount:
                runs[-1].append(amount)
            else:
                runs.append([amount])
        if len(runs) != 2 or len(runs[0]) < 3:
            continue
        old, new = runs[0][0], runs[1][0]
        if abs(new - old) / old < Decimal("0.05"):
            continue
        if _is_whole_multiple(new, old) or _is_whole_multiple(old, new):
            continue  # two or three months billed at once: a double debit, not a new price
        change_at = series.charges[len(runs[0])].transaction_date
        month_name = _MONTH_FULL[change_at.month]
        step = abs(new - old)
        if new > old:
            percent = (step / old * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
            when = f"in {month_name}" if len(runs[1]) == 1 else f"from {month_name}"
            yearly = _round_to(step * 12, 10)
            rises.append(
                ReviewFinding(
                    key=f"price_rise:{name}",
                    group="review",
                    leak_type="recurring_payment_leak",
                    type_note="(price rise)",
                    title=f"{name} price rise",
                    display="table",
                    shows=(
                        f"{money(old)} for {len(runs[0])} months, then "
                        f"**{money(new)}** {when} (+{money(step)}/month, +{percent}%, about "
                        f"{money(yearly)}/year)."
                    ),
                    cannot_show="Whether your cover changed." if name.lower() in _INSURERS else "Whether what you get changed.",
                    figures={"old": old, "new": new, "step": step},
                    rows=[
                        evidence_row(tx, "before" if index < len(runs[0]) else "after")
                        for index, tx in enumerate(series.charges)
                    ],
                )
            )
        else:
            drops.append(
                ReviewFinding(
                    key=f"price_drop:{name}",
                    group="good_news",
                    leak_type="recurring_payment_leak",
                    title=f"{name} dropped from {money(old)} to {money(new)}",
                    display="item",
                    line=(
                        f"**{name} dropped from {money(old)} to {money(new)}** in {month_name}, which is "
                        f"{money(step)}/month less. TracePay uses the current price, not the old one."
                    ),
                    figures={"old": old, "new": new, "step": step},
                    rows=[
                        evidence_row(tx, "before" if index < len(runs[0]) else "after")
                        for index, tx in enumerate(series.charges)
                    ],
                )
            )
    return rises, drops


def _without_fees_credited_back(
    fees: list[FeatureTransaction], txs: list[FeatureTransaction]
) -> list[FeatureTransaction]:
    """A fee the bank credited back the same day is not a cost."""
    credits = [tx for tx in txs if _is_fee_reversal(tx)]
    used: set[str] = set()
    kept = []
    for fee in fees:
        match = next(
            (
                credit
                for credit in credits
                if credit.transaction_id not in used
                and credit.transaction_date == fee.transaction_date
                and credit.amount == fee.amount
            ),
            None,
        )
        if match is not None:
            used.add(match.transaction_id)
            continue
        kept.append(fee)
    return kept


def _is_fee_reversal(tx: FeatureTransaction) -> bool:
    if _is_debit(tx):
        return False
    text = (tx.description or "").lower()
    if _klass(tx) == "bank_fee":
        return True
    return "reversal" in text or ("fee" in text and ("unpaid" in text or "correction" in text))


def _is_unpaid_debit_order(tx: FeatureTransaction) -> bool:
    lower = (tx.description or "").lower()
    return "debit order" in lower and ("insufficient" in lower or "unpaid" in lower)


def _account_charge_label(description: str) -> tuple[str, str]:
    """Group the same kind of account charge. Everything else keeps its printed name."""
    raw = description.strip()
    lower = raw.lower()
    if "sms notification" in lower or ("sms" in lower and "fee" in lower):
        return "sms notification fees", "SMS notification fees"
    if "debit order" in lower and ("insufficient" in lower or "unpaid" in lower):
        return "unpaid debit order fees", "Unpaid debit order fees"
    if "insufficient funds" in lower or "limit exceeded" in lower:
        return "declined card fees", "Declined card fees"
    if lower.startswith("fee:") or lower.startswith("fee refund:"):
        if "cash sent" in lower or "cash send" in lower:
            return "cash sent fees", "Cash sent fees"
        if _CARD_PURCHASE.search(lower):
            return "card purchase fees", "Card purchase fees"
    if "prepaid" in lower and "fee" in lower:
        return "prepaid purchase fees", "Prepaid purchase fees"
    if "advance" in lower and "fee" in lower:
        return "advance fees", "Advance fees"
    if lower in {"fee", "fees"}:
        return "service fees", "Service fees"
    if "no funds" in lower or "item unpaid" in lower:
        return "unpaid item fee", "Unpaid item fee"
    if _messy_fee_text(raw):
        named = _named_bank_charge(lower)
        if named:
            label = named[:1].upper() + named[1:]
            return named, label
    cleaned = raw.lstrip("#").strip()
    return (cleaned or raw).lower(), cleaned or raw


def _messy_fee_text(text: str) -> bool:
    """A fee line the reader joined to a date, a hash mark, or the purchase it sat on."""
    return "#" in text or "pymt" in text.lower() or bool(re.match(r"^[lI\d}]", text))


def _named_bank_charge(text: str) -> str | None:
    """A payment-fee line whose printed name would otherwise collapse to "Payment"."""
    if "bundle" in text and "fee" in text:
        return "payments bundle fee"
    if "pymt" in text:
        return "international payment fee"
    if "no funds" in text or "item unpaid" in text:
        return "unpaid item fee"
    if "paypal" in text and "fee" in text:
        return "PayPal withdrawal fee"
    if "unsuccessful" in text or "declined" in text:
        return "declined transaction fee"
    if "balance" in text and ("enq" in text or "atm" in text):
        return "balance enquiry fee"
    if "atm" in text and "fee" in text:
        return "ATM fee"
    if "service fee" in text:
        return "service fees"
    return None


def _payment_fee_kind(description: str) -> str:
    """The payment the fee was charged for, so an ATM fee is never called PayShap."""
    text = description.lower()
    named = _named_bank_charge(text)
    if named:
        return named.removesuffix(" fee").removesuffix(" fees")
    if "atm" in text or "cash withdrawal" in text:
        return "ATM"
    if "shap" in text:
        return "PayShap"
    if "cash sent" in text or "cash send" in text or "send money" in text:
        return "Cash send"
    if "immediate" in text:
        return "Immediate payment"
    if "capitec pay" in text:
        return "Capitec Pay"
    if "prepaid" in text:
        return "Prepaid purchase"
    return "Payment"


def _paid_for(fee: FeatureTransaction, txs: list[FeatureTransaction]) -> FeatureTransaction | None:
    """The debit this fee sits on.

    Usually the previous payment that day. An ATM fee sits on the cash withdrawal,
    even when a card purchase was posted closer to the fee.
    """
    try:
        index = txs.index(fee)
    except ValueError:
        return None
    earlier_debits = []
    for earlier in reversed(txs[:index]):
        if earlier.transaction_date != fee.transaction_date:
            break
        if _is_debit(earlier) and not _is_fee(earlier):
            earlier_debits.append(earlier)
    if not earlier_debits:
        return None
    if re.search(r"\batm\b|cash withdrawal", fee.description or "", re.IGNORECASE):
        cash = next(
            (
                tx
                for tx in earlier_debits
                if re.search(r"\batm\b|\bcash\b", tx.description or "", re.IGNORECASE)
            ),
            None,
        )
        if cash is not None:
            return cash
    return earlier_debits[0]


def _outsized_fee_note(fees: list[FeatureTransaction], txs: list[FeatureTransaction]) -> str:
    """Name a fee that is large next to the payment it was charged on."""
    notes = []
    for fee in fees:
        paid = _paid_for(fee, txs)
        if paid is None or paid.amount <= 0:
            continue
        if fee.amount < Decimal("10"):
            continue
        if fee.amount < Decimal("20") and fee.amount < paid.amount * Decimal("0.15"):
            continue
        notes.append(f"{money(fee.amount)} on the {money(paid.amount)} payment")
    if not notes:
        return ""
    return " (including " + _join(notes) + ")"


def _fee_breakdown(
    txs: list[FeatureTransaction], month_count: int
) -> tuple[ReviewFinding | None, dict[str, Decimal]]:
    # An optional recurring charge is raised on its own (see _optional_charges): the bank
    # bills it, but it may be a choice, unlike the account's own charges.
    optional = {tx.transaction_id for items in _optional_charge_series(txs).values() for tx in items}
    fees = [
        tx for tx in txs if _is_fee(tx) and not _is_interest(tx) and tx.transaction_id not in optional
    ]
    fees = _without_fees_credited_back(fees, txs)
    if not fees:
        return None, {}
    total = sum((tx.amount for tx in fees), _ZERO)
    service = [tx for tx in fees if _is_service_charge(tx)]
    cross = [tx for tx in fees if _is_cross_border(tx)]
    other = [tx for tx in fees if tx not in service and tx not in cross]

    parts: list[str] = []
    if service:
        service.sort(key=lambda tx: tx.transaction_date)
        amounts = [tx.amount for tx in service]
        runs: list[list[date]] = []
        values: list[Decimal] = []
        for tx in service:
            if values and values[-1] == tx.amount:
                runs[-1].append(tx.transaction_date)
            else:
                values.append(tx.amount)
                runs.append([tx.transaction_date])
        history = ""
        if len(values) == 2:
            history = (
                f" ({money(values[0])}, then **{money(values[1])}** from "
                f"{_MONTH_FULL[runs[1][0].month]})"
            )
        parts.append(f"Monthly service charge {money(sum(amounts, _ZERO))}{history}.")
    rates: dict[str, Decimal] = {}
    if cross:
        by_source: dict[str, Decimal] = defaultdict(lambda: _ZERO)
        for tx in cross:
            source = re.sub(r"^cross-border card fee\s*-\s*", "", tx.description, flags=re.IGNORECASE)
            source_name = payee_name(
                FeatureTransaction(
                    transaction_id=tx.transaction_id,
                    user_id=tx.user_id,
                    amount=tx.amount,
                    categorisation=tx.categorisation,
                    description=source,
                    transaction_type="debit",
                    transaction_date=tx.transaction_date,
                )
            )
            # The fee names the platform, not the plan: "Google One" is just "Google" here.
            by_source[source_name.split()[0]] += tx.amount
        ordered = sorted(by_source.items(), key=lambda item: -item[1])
        cross_total = sum(by_source.values(), _ZERO)
        parts.append(
            f"Cross-border fees {money(cross_total)} ("
            + ", ".join(f"{name} {money(amount)}" for name, amount in ordered)
            + ")."
        )
        for name, fee_total in by_source.items():
            charged = sum(
                (
                    tx.amount
                    for tx in txs
                    if _is_debit(tx) and not _is_fee(tx) and payee_name(tx).split()[0] == name
                ),
                _ZERO,
            )
            if charged > 0:
                # The fee as a share of what was charged, to the nearest half a percent.
                half_points = (fee_total / charged * 100 / Decimal("0.5"))
                rates[name] = half_points.quantize(Decimal(1), rounding=ROUND_HALF_UP) * Decimal("0.5")
    # Charges the bank makes for the account itself (monthly, facility, programme premium)
    # are named as they are printed, not lumped in as payment fees. An unpaid debit order
    # is one of those, even though the word "eft" also appears on payment fees.
    upkeep = [
        tx
        for tx in other
        if _is_unpaid_debit_order(tx) or not _PAYMENT_FEE.search(tx.description or "")
    ]
    if upkeep:
        by_name: dict[str, Decimal] = defaultdict(lambda: _ZERO)
        display: dict[str, str] = {}
        for tx in upkeep:
            key, label = _account_charge_label(tx.description or "")
            display.setdefault(key, label)
            by_name[key] += tx.amount
        ordered_upkeep = sorted(by_name.items(), key=lambda item: -item[1])
        parts.append(
            "Account charges "
            + ", ".join(f"{display[key]} {money(amount)}" for key, amount in ordered_upkeep)
            + "."
        )
        other = [tx for tx in other if tx not in upkeep]
    if other:
        by_kind: dict[str, list[FeatureTransaction]] = defaultdict(list)
        for tx in other:
            by_kind[_payment_fee_kind(tx.description or "")].append(tx)
        kind_bits = []
        for kind, rows in sorted(by_kind.items(), key=lambda item: -sum(tx.amount for tx in item[1])):
            kind_total = sum((tx.amount for tx in rows), _ZERO)
            note = _outsized_fee_note(rows, txs)
            label = kind[:1].upper() + kind[1:]
            kind_bits.append(f"{label} fees {money(kind_total)}{note}")
        parts.append(". ".join(kind_bits) + ".")

    # One cycle date can cover a statement whose fees were charged across several months.
    fee_months = len({_month_key(tx.transaction_date) for tx in fees if tx.transaction_date})
    shown_months = fee_months if month_count == 1 and fee_months > 1 else month_count
    finding = ReviewFinding(
        key="bank_fees",
        group="review",
        leak_type="bank_fee_leak",
        title="Bank fees, itemised",
        display="table",
        shows=f"{money(total)} over {shown_months} months. " + " ".join(parts),
        cannot_show="Whether a cheaper account tier suits you.",
        figures={"total": total, "service": sum((tx.amount for tx in service), _ZERO)},
        rows=[
            evidence_row(
                tx,
                "service charge"
                if tx in service
                else "cross-border fee"
                if tx in cross
                else "account charge"
                if tx in upkeep
                else "payment fee",
            )
            for tx in fees
        ],
    )
    return finding, rates


def _implied_overdraft(
    txs: list[FeatureTransaction], ctx: StatementContext, month_count: int
) -> ReviewFinding | None:
    interest = [tx for tx in txs if _is_interest(tx)]
    if not interest:
        return None
    charged = sum((tx.amount for tx in interest), _ZERO)
    rebates = [tx for tx in txs if _is_interest_rebate(tx)]
    rebate_total = sum((tx.amount for tx in rebates), _ZERO)
    total = max(charged - rebate_total, _ZERO)
    # A few cents of interest after one overdrawn day is not a cost worth a finding.
    if total < Decimal("1"):
        return None
    monthly = (total / month_count).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    if rebate_total > 0:
        sentences = [
            f"{money(charged)} charged over {month_count} months, {money(rebate_total)} paid back, "
            f"so the cost is {money(total)} (about {money(monthly)}/month)."
        ]
    else:
        sentences = [f"{money(total)} over {month_count} months (about {money(monthly)}/month)."]
    overdue = [
        tx
        for tx in txs
        if not _is_debit(tx) and re.search(r"\boverdue\b", tx.description or "", re.IGNORECASE)
    ]
    if overdue:
        when = _join(sorted({tx.transaction_date.strftime("%d %b") for tx in overdue}))
        sentences.append(
            f"A payment on {when} is labelled overdue. The statement does not show "
            "how many days of interest that added."
        )
    # A card statement prints a credit limit and no overdraft facility.
    is_card = ctx.credit_limit is not None and ctx.facility is None
    rates_by_month: dict[str, Decimal] = {}
    balances: list[Decimal] = []
    # One month's interest can post as more than one line (a main charge and a few cents).
    # The implied balance comes from the month's whole interest, not from each line.
    per_month: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    lines_per_month: dict[str, list[FeatureTransaction]] = defaultdict(list)
    for tx in sorted(interest, key=lambda item: item.transaction_date):
        # Interest posts on the first of the next month, for the month just ended.
        month = _month_key(tx.transaction_date - timedelta(days=1))
        per_month[month] += tx.amount
        lines_per_month[month].append(tx)
    for month, amount in per_month.items():
        rate = ctx.debit_interest_rates.get(month)
        if rate:
            rates_by_month[month] = rate
            balances.append(amount / (rate / 12 / 100))
    for month in sorted(lines_per_month):
        lines = lines_per_month[month]
        if len(lines) > 1:
            parts_text = " and ".join(money(tx.amount) for tx in lines)
            sentences.append(
                f"Interest for {_month_name(month)} was posted as {len(lines)} lines "
                f"({parts_text}); they are counted together."
            )
    if rates_by_month:
        keys = sorted(rates_by_month)
        first, last = rates_by_month[keys[0]], rates_by_month[keys[-1]]
        if first != last:
            change_key = next(key for key in keys if rates_by_month[key] != first)
            sentences.append(
                f"The rate went from {first:.2f}% to **{last:.2f}%** in {_month_name(change_key)}."
            )
        low, high = min(balances), max(balances)
        limit = ctx.facility or ctx.credit_limit
        near = ""
        if limit and high >= limit * Decimal("0.9"):
            near = f", at or near the {_kilo(limit)} limit"
        owed = "balance owed on the card" if is_card else "overdraft"
        sentences.append(
            f"The interest implies an average {owed} of about "
            f"R{_round_to(low, 1000) / 1000:.0f}–{_round_to(high, 1000) / 1000:.0f}k{near}."
        )
    return ReviewFinding(
        key="overdraft_interest",
        group="review",
        leak_type="high_cost_credit_leak",
        title="Credit card interest" if is_card else "Overdraft interest",
        display="table",
        shows=" ".join(sentences),
        cannot_show=(
            "Whether paying the card down sooner would avoid this interest."
            if is_card
            else "Whether the cash you move around sits idle elsewhere."
        ),
        figures={"total": total, "charged": charged, "months": month_count},
        rows=evidence_rows([*interest, *rebates], "interest"),
    )


_SAVINGS_POCKET = re.compile(r"round[ -]?up|interest\s+sweep|\blive better\b", re.IGNORECASE)


def _is_savings_pocket(tx: FeatureTransaction) -> bool:
    """A round-up or savings-pocket sweep. The money is saved, not sent away and reversed."""
    return _SAVINGS_POCKET.search(tx.description or "") is not None


def _round_trips(txs: list[FeatureTransaction], ctx: StatementContext) -> ReviewFinding | None:
    """Money sent to the customer's own accounts that comes back within days."""
    out_by_month: dict[str, list[FeatureTransaction]] = defaultdict(list)
    incoming = [
        tx
        for tx in txs
        if _klass(tx) == "internal_transfer" and not _is_debit(tx) and not _is_savings_pocket(tx)
    ]
    for tx in txs:
        if _klass(tx) == "internal_transfer" and _is_debit(tx) and not _is_savings_pocket(tx):
            out_by_month[_month_key(tx.transaction_date)].append(tx)
    trips, stayed = [], []
    for month, outs in sorted(out_by_month.items()):
        total = sum((tx.amount for tx in outs), _ZERO)
        last = max(tx.transaction_date for tx in outs)
        back = [tx for tx in incoming if last <= tx.transaction_date <= last + timedelta(days=4)]
        returned = sum((tx.amount for tx in back), _ZERO)
        entry = (month, outs, total, last, back, returned)
        (trips if returned >= total / 2 else stayed).append(entry)
    if len(trips) < 2:
        return None
    typical = Counter(entry[2] for entry in trips).most_common(1)[0][0]
    destinations = {}
    for entry in trips:
        for tx in entry[1]:
            destinations[tx.description] = max(destinations.get(tx.description, _ZERO), tx.amount)
    names = _join([name for name, _ in sorted(destinations.items(), key=lambda item: item[1])])
    out_days = [tx.transaction_date.day for entry in trips for tx in entry[1]]
    offsets = [(tx.transaction_date - entry[3]).days for entry in trips for tx in entry[4]]
    month_names = _join([_month_name(entry[0], full=False) for entry in trips])
    back_text = ", ".join(f"{money(entry[5])} ({_month_name(entry[0], full=False)})" for entry in trips)
    shows = (
        f"Out on the {_ordinal(min(out_days))}–{_ordinal(max(out_days))} in {month_names}. Back within "
        f"{min(offsets)}–{max(offsets)} days: {back_text}."
    )
    for month, outs, total, _last, _back, returned in stayed:
        if total >= 1000 and returned == 0:
            where = _join(sorted({tx.description for tx in outs}))
            shows += f" In {_month_name(month)}, {money(total)} went to {where} and nothing returned."
    cannot = "Where the money sits in between."
    rate = next(iter(ctx.debit_interest_rates.values()), None)
    if ctx.credit_interest_rate is not None and rate is not None:
        shows += (
            f" The credit rate is {ctx.credit_interest_rate:.2f}% against "
            f"{rate.normalize():f}% debit."
        )
    if rate is not None:
        saving = (typical * rate / 12 / 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
        cannot += (
            f" If it were idle, {money(typical)} against the overdraft would save about "
            f"{money(saving)}/month in interest."
        )
    return ReviewFinding(
        key="round_trip_transfers",
        group="review",
        leak_type="recurring_transfer_leak",
        title=f"{money(typical)}/month goes to {names}, then comes back",
        display="table",
        shows=shows,
        cannot_show=cannot,
        questions=[
            ask(
                "round_trip_transfers",
                "recurring_transfer_leak",
                "transfer_purpose",
                names,
                names,
                f"{money(typical)} goes to {names} each month and comes back within days. "
                "Is it money you keep there, or a budgeting move you reverse?",
                "Only you know. Money you keep is saving; money you move straight back "
                "is a different thing, so your answer changes how this is read.",
                signature=f"amt={typical.quantize(Decimal(1))}",
            )
        ],
        figures={"typical": typical, "months": [entry[0] for entry in trips]},
        rows=[
            *[evidence_row(tx, "out") for entry in [*trips, *stayed] for tx in entry[1]],
            *[evidence_row(tx, "back") for entry in trips for tx in entry[4]],
        ],
    )


def _optional_charges(txs: list[FeatureTransaction]) -> list[ReviewFinding]:
    """Each recurring bank charge that is not account upkeep, with a question about it.

    The bank bills these, but the customer may have chosen them (a rewards programme, a
    cover, a package), so the statement cannot say whether they are worth what they cost.
    """
    findings = []
    for name, items in _optional_charge_series(txs).items():
        months = sorted({_month_key(tx.transaction_date) for tx in items})
        amount = items[0].amount
        total = sum((tx.amount for tx in items), _ZERO)
        label = _statement_text(items[0]) or name.title()
        findings.append(
            ReviewFinding(
                key=f"optional_charge:{slug(name)}",
                group="review",
                leak_type="subscription_leak",
                title=f"{label}: a recurring charge from your bank",
                display="table",
                shows=(
                    f"{money(amount)}/month in {_join([_month_name(key, full=False) for key in months])}, "
                    f"{money(total)} in all. It is separate from the account's own fees."
                ),
                cannot_show=f"Whether you get value from what {label} pays for.",
                questions=[
                    ask(
                        f"optional_charge:{slug(name)}",
                        "subscription_leak",
                        "subscription_usage",
                        label,
                        label,
                        f"Your bank charges you {money(amount)} a month for {label}. "
                        "Do you still use what it pays for?",
                        "Only you can say whether it is worth the cost, so your answer decides "
                        "whether this is shown.",
                        signature=f"amt={amount.quantize(Decimal(1))}",
                    )
                ],
                figures={"amount": amount, "total": total, "months": months, "label": label},
                rows=evidence_rows(items, "recurring charge"),
            )
        )
    return findings


def _opaque_billing(series_map: dict[str, _Series]) -> ReviewFinding | None:
    """A billing name with many different amounts, so the statement cannot say what each one is."""
    for name, series in series_map.items():
        amounts = Counter(tx.amount for tx in series.charges)
        if len(amounts) < 6 or len(series.charges) < 12:
            continue
        # Only a billing platform: its descriptions never say which app or plan was bought.
        platform = sum(1 for tx in series.charges if _PLATFORM_BILLING.search(tx.description or ""))
        if platform < len(series.charges) * 0.8:
            continue
        month_of: dict[Decimal, set[str]] = defaultdict(set)
        for tx in series.charges:
            month_of[tx.amount].add(_month_key(tx.transaction_date))
        all_months = _consecutive(series.months)
        last = all_months[-1]
        stopped: dict[str, list[Decimal]] = defaultdict(list)
        continuing, new = [], []
        first_seen: dict[Decimal, date] = {}
        for tx in series.charges:
            first_seen.setdefault(tx.amount, tx.transaction_date)
        for amount, months in month_of.items():
            if len(months) >= 2 and max(months) < last:
                stopped[max(months)].append(amount)
            elif len(months) >= 2:
                continuing.append(amount)
            elif months == {last}:
                new.append(amount)
        total = sum((tx.amount for tx in series.charges), _ZERO)
        parts = [f"{money(total)} across {len(series.charges)} charges."]
        for month in sorted(stopped):
            # The ones paid most often first, then the larger amount.
            amts = sorted(stopped[month], key=lambda a: (-amounts[a], -a))
            parts.append(f"{money_list(amts)} **stopped after {_month_name(month)}**.")
        if continuing:
            ordered = sorted(continuing, key=lambda amount: first_seen[amount])
            parts.append(f"{money_list(ordered)} continue.")
        if new:
            news = sorted(new)
            listed = money_list(news).replace(" and ", ", ")
            parts.append(f"New in {_month_name(last)}: {listed}.")
        stopped_all = [a for month in sorted(stopped) for a in sorted(stopped[month], key=lambda a: (-amounts[a], -a))]
        stopped_charges = [
            (tx.transaction_date.isoformat(), str(tx.amount))
            for tx in series.charges
            if tx.amount in stopped_all
        ]
        questions = []
        if stopped_all:
            question_months = _consecutive(series.months)
            first_year, first_month = (int(part) for part in question_months[0].split("-"))
            before = (first_year - 1, 12) if first_month == 1 else (first_year, first_month - 1)
            values = [f"{before[0]:04d}-{before[1]:02d}", *question_months]
            options = [
                QuestionOption(
                    value=value,
                    label=(
                        f"Before {_month_name(question_months[0])}"
                        if index == 0
                        else f"{_month_name(value, full=False)} {value[:4]}"
                    ),
                )
                for index, value in enumerate(values)
            ]
            options.append(QuestionOption(value="not_sure", label="Not sure"))
            questions.append(
                ask(
                    f"opaque_billing:{name}",
                    "subscription_leak",
                    "cancelled_in",
                    name,
                    name,
                    f"Did you cancel the {name} {money_list(stopped_all)} charges? If so, in which month?",
                    "We can then check whether your statements show any of them after that month.",
                    options=options,
                )
            )
        return ReviewFinding(
            key=f"opaque_billing:{name}",
            group="review",
            leak_type="subscription_leak",
            title=f"{name} billing you may not recognise",
            display="table",
            shows=" ".join(parts),
            cannot_show="What each charge is.",
            questions=questions,
            figures={
                "total": total,
                "count": len(series.charges),
                "payee": name,
                "stopped_charges": stopped_charges,
            },
            rows=[
                evidence_row(tx, "stopped" if tx.amount in stopped_all else "charge")
                for tx in series.charges
            ],
        )
    return None


def _cloud_overlap(series_map: dict[str, _Series], opaque: ReviewFinding | None) -> ReviewFinding | None:
    parts, present = [], []
    for name in _CLOUD:
        series = series_map.get(name)
        if name == "Apple":
            if opaque is not None and opaque.figures.get("payee") == "Apple":
                parts.append("Apple recurring charges")
                present.append(name)
            continue
        if series and _is_monthly(series):
            parts.append(f"{name} {money(series.regular_amount)}/month")
            present.append(name)
    if len(present) < 2:
        return None
    domain_rows: list[EvidenceRow] = []
    for name, series in series_map.items():
        if any(host in name.lower() for host in _DOMAIN_HOSTS) and series.charges:
            total = sum((tx.amount for tx in series.charges), _ZERO)
            months = sorted({_month_name(key) for key in series.months})
            parts_text = ", ".join(parts) + f". {name}: {money(total)} in {_join(months)}."
            domain_rows = evidence_rows(series.charges, "domain")
            break
    else:
        parts_text = ", ".join(parts) + "."
    # Apple's rows are listed under its own finding.
    service_rows = [
        evidence_row(tx)
        for name in present
        if name != "Apple" and name in series_map
        for tx in series_map[name].charges
    ]
    return ReviewFinding(
        key="cloud_overlap",
        group="review",
        leak_type="subscription_leak",
        title="Overlapping cloud and software",
        display="table",
        shows=parts_text,
        cannot_show="Which plans you use.",
        rows=[*service_rows, *domain_rows],
        questions=[
            ask(
                "cloud_overlap",
                "subscription_leak",
                "subscription_usage",
                name,
                name,
                f"You paid {name} {money(series_map[name].regular_amount)}. Do you still use it?",
                "Your answer shows whether this is worth reviewing. Rarely using something does not prove it is wasted.",
                signature=f"amt={series_map[name].regular_amount.quantize(Decimal(1))}",
            )
            for name in present
            if name != "Apple" and name in series_map
        ],
        figures={
            "present": present,
            # What the services with a visible monthly price cost together.
            "monthly": sum(
                (series_map[name].regular_amount for name in present if name != "Apple" and name in series_map),
                _ZERO,
            ),
        },
    )


def _insurers(series_map: dict[str, _Series]) -> ReviewFinding | None:
    found = [
        series
        for name, series in series_map.items()
        if any(insurer in name.lower() for insurer in _INSURERS) and _is_monthly(series, 3)
    ]
    if len(found) < 3:
        return None
    found.sort(key=lambda series: -series.latest.amount)
    latest = [(series.name, series.latest.amount) for series in found]
    total = sum((amount for _, amount in latest), _ZERO)
    count = _NUMBER_WORDS.get(len(found), str(len(found))).capitalize()
    return ReviewFinding(
        key="insurers",
        group="review",
        leak_type="overlapping_cover_leak",
        title=f"{count} insurers",
        display="table",
        shows=f"{_join([f'{name} {money(amount)}' for name, amount in latest])} = {money(total)}/month now.",
        cannot_show="What each one covers.",
        questions=[
            ask(
                "insurers",
                "overlapping_cover_leak",
                "insurance_cover",
                name,
                name,
                f"What does your {name} policy cover?",
                "Knowing what each policy covers lets us check whether any overlap. "
                "It does not mean the cover is unnecessary.",
                signature=f"amt={amount.quantize(Decimal(1))}",
            )
            for name, amount in latest
        ],
        figures={"insurers": [name for name, _ in latest], "monthly": total},
        rows=[evidence_row(tx) for series in found for tx in series.charges],
    )


_FOREIGN_FEE_WORDS = re.compile(
    r"cross.?border|international|intl|foreign|forex|currency", re.IGNORECASE
)


def _foreign_billing_parent(series: _Series, series_map: dict[str, _Series]) -> str | None:
    """The payee a small foreign-transaction fee is charged alongside, or None.

    A fee under R10 named for its kind, posting on the same days as another payee's charges
    on two or more occasions, belongs to that payee.
    """
    if series.regular_amount >= Decimal("10") or not _FOREIGN_FEE_WORDS.search(series.name):
        return None
    fee_days = {tx.transaction_date for tx in series.charges}
    best: tuple[int, str] | None = None
    for name, other in series_map.items():
        if other is series or _FOREIGN_FEE_WORDS.search(name):
            continue
        shared = len(fee_days & {tx.transaction_date for tx in other.charges})
        if shared >= 2 and (best is None or shared > best[0]):
            best = (shared, name)
    return best[1] if best else None


def _unknown_recurring(series_map: dict[str, _Series]) -> list[ReviewFinding]:
    findings = []
    for name, series in series_map.items():
        sample = series.charges[0]
        if series.charges[0].merchant_name or _klass(sample) != "unknown":
            continue
        lowered = name.lower()
        if any(token in lowered for token in (*_TELECOMS, *_LENDERS, "rent", *_DOMAIN_HOSTS)):
            continue
        if not _is_monthly(series, 3) or len({tx.amount for tx in series.charges}) != 1:
            continue
        if series.regular_amount > Decimal("1000"):
            continue
        months = series.months
        missing = [key for key in _consecutive(months) if key not in months]
        label = _statement_text(sample)
        names = [_month_name(key, full=False) for key in months]
        gap = f" Nothing in {_join([_month_name(key) for key in missing])}." if missing else ""
        parent = _foreign_billing_parent(series, series_map)
        if parent is not None:
            # A small cross-border fee on the days another charge posts is that charge's
            # foreign billing, not a merchant of its own.
            findings.append(
                ReviewFinding(
                    key=f"unknown_recurring:{name}",
                    group="review",
                    leak_type="unknown_recurring_payment",
                    title=f"Foreign-billing fee on {parent}",
                    display="table",
                    shows=(
                        f"{money(series.regular_amount)} each time {parent} is charged, in "
                        f"{_join(names)}: {money(series.regular_amount * len(series.charges))} in all."
                    ),
                    cannot_show=f"Whether {parent} offers billing in rand without the fee.",
                    figures={
                        "amount": series.regular_amount,
                        "months": months,
                        "label": label,
                        "parent": parent,
                    },
                    rows=evidence_rows(series.charges, "fee"),
                )
            )
            continue
        findings.append(
            ReviewFinding(
                key=f"unknown_recurring:{name}",
                group="review",
                leak_type="unknown_recurring_payment",
                title=f'Unknown recurring merchant "{label}"',
                display="table",
                shows=f"{money(series.regular_amount)}/month in {_join(names)}.{gap}",
                cannot_show="Who this is.",
                questions=[
                    ask(
                        f"unknown_recurring:{name}",
                        "unknown_recurring_payment",
                        "payment_purpose",
                        label,
                        label.split("*")[-1].strip(),
                        f"You pay {money(series.regular_amount)} regularly to {label} and the "
                        "statement does not say who it goes to. What is it for?",
                        "Only you know. Savings, rent and loan repayments are not leaks, so your "
                        "answer decides whether this is shown.",
                        signature=f"amt={series.regular_amount.quantize(Decimal(1))}",
                    )
                ],
                figures={"amount": series.regular_amount, "months": months, "label": label},
                rows=evidence_rows(series.charges),
            )
        )
    return findings


def _delivery_habit(txs: list[FeatureTransaction]) -> ReviewFinding | None:
    orders = [tx for tx in _purchases(txs) if delivery_service(tx.description)]
    if len(orders) < 10:
        return None
    total = sum((tx.amount for tx in orders), _ZERO)
    # Named for the service when there is one, so the customer reads their own app's name.
    services = sorted({delivery_service(tx.description) or "" for tx in orders})
    name = services[0] if len(services) == 1 else "Food delivery"
    by_month: dict[str, list[FeatureTransaction]] = defaultdict(list)
    for tx in orders:
        by_month[_month_key(tx.transaction_date)].append(tx)
    month_totals = {key: sum((tx.amount for tx in items), _ZERO) for key, items in by_month.items()}
    spike = max(month_totals, key=month_totals.get)
    others = [value for key, value in month_totals.items() if key != spike]
    typical = _round_to(Decimal(str(median(others))), 100) if others else None
    sentences = [
        f"**{len(orders)} orders, {money(total)}**, averaging "
        f"{money((total / len(orders)).quantize(Decimal(1), rounding=ROUND_HALF_UP))}."
    ]
    if typical and month_totals[spike] >= typical * 2:
        sentences.append(
            f"{_month_name(spike)} was {money(month_totals[spike])} across {len(by_month[spike])} "
            f"orders, against about {money(typical)} in a normal month."
        )
    paydays = [
        tx.transaction_date.day for tx in txs if _klass(tx) == "income" and not _is_debit(tx)
    ]
    if paydays:
        payday = int(median(paydays))
        late = [tx for tx in orders if tx.transaction_date.day >= payday]
        if len(late) * 2 > len(orders):
            late_total = sum((tx.amount for tx in late), _ZERO)
            sentences.append(
                f"**{len(late)} of the {len(orders)} orders ({money(late_total)}) fall on the "
                f"{_ordinal(payday)}–{_ordinal(31)}**, the payday week."
            )
    return ReviewFinding(
        key="food_delivery",
        group="review",
        leak_type="food_spending_leak",
        title=name,
        display="table",
        shows=" ".join(sentences),
        cannot_show="Delivery and service fees inside each total.",
        questions=[
            ask(
                "food_delivery",
                "food_spending_leak",
                "spending_level",
                name,
                name,
                f"Your statements show {len(orders)} {name} orders, {money(total)} in all. "
                "Is that about what you usually spend on delivery?"
                if len(services) == 1
                else f"Your statements show {len(orders)} food delivery orders ({_join(services)}), "
                f"{money(total)} in all. Is that about what you usually spend on delivery?",
                "The statements show the amount, not whether it is normal for you, so your "
                "answer decides whether this is shown.",
                signature=f"amt={(total / len(orders)).quantize(Decimal(1), rounding=ROUND_HALF_UP)}",
            )
        ],
        figures={"orders": len(orders), "total": total},
        rows=evidence_rows(orders, "order"),
    )


#: Categorisation rules that read a purchase as mobile airtime or data.
_AIRTIME_RULES = frozenset(
    {
        "merchant:airtime-data",
        "description:prepaid-airtime",
        "description:airtime-wording",
        "description:data-bundle",
        "description:vas-mobile-purchase",
        "description:mobile-purchase-phone",
        "description:online-mtn",
        "description:mobile-bundle",
    }
)


# Borrowed airtime, however the bank prints it. Capitec says "Airtime Advance";
# other networks say Xtratime, a data advance, or a recharge loan.
_ADVANCE_MARK = re.compile(
    r"airtime\s+advance|data\s+advance|xtratime|recharge\s+loan|airtime\s+loan|data\s+loan",
    re.IGNORECASE,
)


def _is_airtime_advance_fee(tx: FeatureTransaction) -> bool:
    text = (tx.description or "").lower()
    if _ADVANCE_MARK.search(text) is None:
        return False
    return "fee" in text and "payment" not in text and "repay" not in text


def _is_airtime_advance_payment(tx: FeatureTransaction) -> bool:
    text = (tx.description or "").lower()
    if _ADVANCE_MARK.search(text) is None:
        return False
    return "payment" in text or "repay" in text


def _is_airtime_purchase(tx: FeatureTransaction) -> bool:
    """Airtime or data, by the words printed or by how the row was classified.

    "MTN 1.5 GB" never says airtime; the classifier knows it is a data bundle.
    """
    if re.match(r"vas\s", tx.description or "", re.IGNORECASE) or "airtime" in (tx.description or "").lower():
        return True
    return (
        tx.categorisation.category_name == "Airtime & Data"
        or (tx.categorisation.rule or "") in _AIRTIME_RULES
    )


def _airtime(txs: list[FeatureTransaction], series_map: dict[str, _Series]) -> ReviewFinding | None:
    top_ups = [
        tx
        for tx in _purchases(txs)
        if _is_airtime_purchase(tx)
        and not _is_airtime_advance_fee(tx)
        and not _is_airtime_advance_payment(tx)
    ]
    if not top_ups:
        return None
    contract = next(
        (s for name, s in series_map.items() if any(t in name.lower() for t in _TELECOMS) and _is_monthly(s)),
        None,
    )
    total = sum((tx.amount for tx in top_ups), _ZERO)
    amounts = [tx.amount for tx in top_ups]
    tail = f" on top of a {money(contract.regular_amount)}/month {contract.name} payment" if contract else ""
    return ReviewFinding(
        key="airtime",
        group="review",
        leak_type="airtime_data_leak",
        title="Airtime and data",
        display="item",
        line=(
            f"**Airtime and data:** {len(top_ups)} top-ups, {money(total)}, "
            f"from {money(min(amounts))} to {money(max(amounts))}{tail} (`airtime_data_leak`, low)."
        ),
        figures={"total": total},
        rows=evidence_rows(top_ups, "top-up"),
    )


def _airtime_advances(txs: list[FeatureTransaction]) -> ReviewFinding | None:
    """Borrowed airtime: a fee now, the amount repaid a few days later."""
    fees = [tx for tx in txs if _is_debit(tx) and _is_airtime_advance_fee(tx)]
    repayments = [tx for tx in txs if _is_debit(tx) and _is_airtime_advance_payment(tx)]
    if len(fees) < 2 and len(repayments) < 2:
        return None
    fee_total = sum((tx.amount for tx in fees), _ZERO)
    repaid = sum((tx.amount for tx in repayments), _ZERO)
    rate = ""
    if fees and repayments and len({tx.amount for tx in fees}) == 1 and len({tx.amount for tx in repayments}) == 1:
        rate = f" That is {money(fees[0].amount)} charged on each {money(repayments[0].amount)}."
    return ReviewFinding(
        key="airtime_advance",
        group="review",
        leak_type="airtime_data_leak",
        title="Airtime advances",
        display="table",
        shows=(
            f"{len(fees)} borrowed-airtime fees, {money(fee_total)}, "
            f"and {len(repayments)} repayments, {money(repaid)}.{rate}"
        ),
        cannot_show="The airtime itself. The statement shows the fee and the repayment, not the bundle.",
        figures={"fees": fee_total, "repaid": repaid, "total": fee_total},
        rows=evidence_rows([*fees, *repayments], "advance"),
    )


# Names that do not say "trade" or "fx" but are brokers or crypto exchanges.
# A name that is not here is still found when the payment itself looks like one:
# a company reference, and a payee whose name says what it is. A person's name
# and a shop the categoriser already knows are never treated as a broker.
_TRADING_PLATFORMS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bDERIV\b", re.IGNORECASE), "Deriv"),
    (re.compile(r"\bIQ\s*OPTION\b", re.IGNORECASE), "IQ Option"),
    (re.compile(r"\bOLYMP\s*TRADE\b", re.IGNORECASE), "Olymp Trade"),
    (re.compile(r"\bEXNESS\b", re.IGNORECASE), "Exness"),
    (re.compile(r"\bPLUS\s*500\b|\bPLUS500\b", re.IGNORECASE), "Plus500"),
    (re.compile(r"\bQUOTEX\b", re.IGNORECASE), "Quotex"),
    (re.compile(r"\bPOCKET\s*OPTION\b", re.IGNORECASE), "Pocket Option"),
    (re.compile(r"\bBINARY\.?\s*COM\b", re.IGNORECASE), "Binary.com"),
    (re.compile(r"\bLUNO\b", re.IGNORECASE), "Luno"),
    (re.compile(r"\bVALR\b", re.IGNORECASE), "VALR"),
    (re.compile(r"\beTORO\b", re.IGNORECASE), "eToro"),
    (re.compile(r"\bAVATRADE\b", re.IGNORECASE), "AvaTrade"),
    (re.compile(r"\bHOTFOREX\b|\bHFM\b", re.IGNORECASE), "HFM"),
    (re.compile(r"\bBINANCE\b", re.IGNORECASE), "Binance"),
    (re.compile(r"\bBYBIT\b", re.IGNORECASE), "Bybit"),
    (re.compile(r"\bXM(?:\.COM|\s+GLOBAL|\s+TRADING)\b", re.IGNORECASE), "XM"),
)
# "Capitec Pay Payment: Zenfx (88342111)" — one brand token plus the bank's reference.
# "Immediate Payment: Neo Capitec" is a person and does not match.
_REFERENCED_PAYEE = re.compile(
    r"(?:capitec pay|card purchase|online purchase)[^:\n]{0,48}:\s*"
    r"([A-Za-z][A-Za-z0-9]{1,24})\s*\(\d{5,}\)",
    re.IGNORECASE,
)
_PLATFORM_HINT = re.compile(
    r"\b(?:trade|trader|trading|forex|broker|cfd|binary|option|crypto|invest)\b",
    re.IGNORECASE,
)
_NOT_A_PLATFORM = frozenset({"payment", "pay", "transfer", "fee", "purchase", "card"})


def _trading_name(description: str | None) -> str | None:
    for pattern, name in _TRADING_PLATFORMS:
        if pattern.search(description or ""):
            return name
    return None


def _looks_like_platform_token(token: str) -> bool:
    """A brand whose own name says it takes trading or crypto deposits.

    "Zenfx" and "Hotforex" qualify. "Equifax" does not, and neither does a shop or a person.
    """
    lower = token.casefold()
    if lower.endswith("fax"):
        return False
    return re.search(r"(?:fx|forex|trade|trader|broker|cfd|crypto|coin)$", lower) is not None


def _platform_payee(description: str | None) -> tuple[str, bool] | None:
    """(display name, listed). None for a person, a known shop, or an ordinary payment."""
    known = _trading_name(description)
    if known:
        return known, True
    from categorisation.merchant_profiles import (
        TRADING_TYPES,
        payee_label,
        type_for_description,
    )

    identified = type_for_description(description)
    if identified in TRADING_TYPES:
        # A model named it a broker or exchange; treated like a listed platform.
        label = payee_label(description, transaction_class="unknown") or ""
        return (label[:1].upper() + label[1:]) or "Trading platform", True
    if identified not in (None, "unknown"):
        # The model says it is something else (a shop, a person, a lender): not a broker.
        return None
    match = _REFERENCED_PAYEE.search(description or "")
    if match is None:
        return None
    token = match.group(1)
    if token.casefold() in _NOT_A_PLATFORM:
        return None
    if not (_looks_like_platform_token(token) or _PLATFORM_HINT.search(description or "")):
        return None
    from categorisation.classifier import classify_transaction
    from categorisation.normalize import normalize_for_matching
    from categorisation.rules import recognised_merchant_label

    if recognised_merchant_label(normalize_for_matching(token) or token.upper()):
        return None
    classified = classify_transaction(token, "debit")
    if classified.transaction_class == "spending" and classified.category_name:
        return None
    return token[:1].upper() + token[1:], False


def _names_payee(description: str | None, name: str) -> bool:
    return (
        re.search(rf"(?<![A-Za-z0-9]){re.escape(name)}(?![A-Za-z0-9])", description or "", re.IGNORECASE)
        is not None
    )


def _trading(txs: list[FeatureTransaction]) -> list[ReviewFinding]:
    """Money sent to a broker, including when the bank calls the payment a transfer to a person."""
    by_name: dict[str, list[FeatureTransaction]] = defaultdict(list)
    listed: set[str] = set()
    for tx in txs:
        if not _is_debit(tx) or _is_fee(tx):
            continue
        found = _platform_payee(tx.description)
        if found is None:
            continue
        name, on_list = found
        by_name[name].append(tx)
        if on_list:
            listed.add(name)
    findings = []
    for name, payments in sorted(by_name.items()):
        # A listed broker is a pattern at the second payment. A name we have never
        # listed needs a third, so two payments to an unknown shop are not a finding.
        if len(payments) < (2 if name in listed else 3):
            continue
        total = sum((tx.amount for tx in payments), _ZERO)
        fee_rows = [tx for tx in txs if _is_fee(tx) and _names_payee(tx.description, name)]
        fee_total = sum((tx.amount for tx in fee_rows), _ZERO)
        returned = sum(
            (tx.amount for tx in txs if not _is_debit(tx) and _names_payee(tx.description, name)),
            _ZERO,
        )
        fee_bit = f" Payment fees on them came to {money(fee_total)}." if fee_total else ""
        back = (
            f" {money(returned)} came back from {name} on this account."
            if returned
            else f" No payment from {name} came back into this account."
        )
        findings.append(
            ReviewFinding(
                key=f"trading:{slug(name)}",
                group="review",
                leak_type="irregular_transaction_leak",
                title=f"Payments to {name}",
                display="table",
                shows=f"{len(payments)} payments, {money(total)}.{fee_bit}{back}",
                cannot_show="What the payments bought, or a result that settled in another account.",
                figures={"total": total, "fees": fee_total, "count": len(payments)},
                rows=evidence_rows([*payments, *fee_rows], "payment"),
            )
        )
    return findings


def _escalation(txs: list[FeatureTransaction], ctx: StatementContext) -> ReviewFinding | None:
    if len(ctx.card_purchases) < 3:
        return None
    keys = sorted(ctx.card_purchases)
    first, last = ctx.card_purchases[keys[0]], ctx.card_purchases[keys[-1]]
    if first <= 0 or last / first < Decimal("1.5"):
        return None
    series = " → ".join(_kilo(ctx.card_purchases[key], 1) for key in keys)
    trip = _trip_city(txs, keys[-1])
    tail = f" {_month_name(keys[-1])} includes the {trip.title()} trip." if trip else ""
    return ReviewFinding(
        key="escalation",
        group="review",
        leak_type="spending_escalation_leak",
        title="Spending escalation",
        display="item",
        line=(
            f"**Spending escalation:** card purchases went {series} from {_month_name(keys[0])} to "
            f"{_month_name(keys[-1])} (`spending_escalation_leak`).{tail}"
        ),
        figures={"first": first, "last": last},
    )


def _city_pattern(city: str) -> re.Pattern[str]:
    """A city as a statement spells it, including the cut-off form ("NEW YO")."""
    words = city.split()
    if len(words) == 1:
        return re.compile(rf"\b{re.escape(city)}\b", re.IGNORECASE)
    return re.compile(
        rf"\b{re.escape(words[0])}\s+{re.escape(words[1][:2])}", re.IGNORECASE
    )


def _trip_city(txs: list[FeatureTransaction], month: str) -> str | None:
    rows = [tx for tx in txs if tx.transaction_date and _month_key(tx.transaction_date) == month]
    for city in _TRIP_CITIES:
        pattern = _city_pattern(city)
        if sum(1 for tx in rows if pattern.search(tx.description or "")) >= 3:
            return city
    return None


def _large_one_off(txs: list[FeatureTransaction], series_map: dict[str, _Series]) -> ReviewFinding | None:
    recurring_names = {name for name, s in series_map.items() if _is_monthly(s, 3)}
    eligible = [
        tx
        for tx in _purchases(txs)
        if _klass(tx) == "spending" and payee_name(tx) not in recurring_names
    ]
    if len(eligible) < 5:
        return None
    ordered = sorted(eligible, key=lambda tx: -tx.amount)
    top = ordered[0]
    if sum(1 for tx in eligible if payee_name(tx) == payee_name(top)) != 1:
        return None
    second = next((tx for tx in ordered[1:] if payee_name(tx) != payee_name(top)), None)
    if top.amount < Decimal("2000") or second is None or top.amount < second.amount * Decimal("1.5"):
        return None
    foreign = _FOREIGN_CURRENCY.search(top.description or "")
    name = payee_name(top)
    if foreign:
        value = Decimal(foreign.group(2)).quantize(Decimal(1))
        label = f"**One large foreign charge:** {name}, {foreign.group(1).upper()} {value} ({money(top.amount)})"
    else:
        label = f"**One large charge:** {name}, {money(top.amount)}"
    return ReviewFinding(
        key="large_one_off",
        group="review",
        leak_type="irregular_transaction_leak",
        title=f"One large charge at {name}",
        display="item",
        line=(
            f"{label} on {_short_date(top.transaction_date)}, with no other months like it "
            "(`irregular_transaction_leak`)."
        ),
        questions=[
            ask(
                "large_one_off",
                "irregular_transaction_leak",
                "one_off_expected",
                name,
                name,
                f"{name} charged {money(top.amount)} on {_short_date(top.transaction_date)}, "
                "far more than anything else. Was that planned?",
                "Only you know whether it was expected, so your answer decides whether this "
                "is shown.",
                signature=f"amt={top.amount.quantize(Decimal(1), rounding=ROUND_HALF_UP)}",
            )
        ],
        figures={"amount": top.amount},
        rows=[evidence_row(top)],
    )


def _repeat_payment(txs: list[FeatureTransaction], series_map: dict[str, _Series]) -> list[ReviewFinding]:
    recurring_names = {name for name, s in series_map.items() if _is_monthly(s, 3)}
    groups: dict[tuple[str, Decimal], list[FeatureTransaction]] = defaultdict(list)
    for tx in _purchases(txs):
        if payee_name(tx) in recurring_names:
            continue
        groups[(payee_name(tx), tx.amount)].append(tx)
    findings = []
    for (name, amount), items in groups.items():
        items.sort(key=lambda tx: tx.transaction_date)
        if len(items) != 2 or amount < Decimal("500"):
            continue
        gap = (items[1].transaction_date - items[0].transaction_date).days
        if not 24 <= gap <= 36:
            continue
        label = _PROCESSOR_PREFIX.sub("", _statement_text(items[0])).title()
        findings.append(
            ReviewFinding(
                key=f"repeat_payment:{name}",
                group="review",
                leak_type="recurring_payment_leak",
                title=f"Repeat payment at {label}",
                display="item",
                line=(
                    f"**Repeat payment:** {label} {money(amount)} on "
                    f"{_short_date(items[0].transaction_date)} and {_short_date(items[1].transaction_date)}."
                ),
                figures={"amount": amount},
                rows=evidence_rows(items),
            )
        )
    return findings


# ----------------------------------------------------------------------------- the rest


def _commitments(txs: list[FeatureTransaction], series_map: dict[str, _Series]) -> list[tuple[Decimal, Commitment]]:
    rows: list[tuple[Decimal, Commitment]] = []
    salaries = sorted(
        (tx for tx in txs if _klass(tx) == "income" and not _is_debit(tx) and "salary" in tx.description.lower()),
        key=lambda tx: tx.transaction_date,
    )
    latest_salary = salaries[-1].amount if salaries else None
    for name, series in series_map.items():
        if not _is_monthly(series, 3) or len(series.charges) > len(series.months) * 2:
            continue
        latest = series.latest.amount
        if _is_whole_multiple(latest, series.regular_amount):
            latest = series.regular_amount  # a double debit is raised on its own, not a new commitment
        distinct = len({tx.amount for tx in series.charges})
        label = name
        amount_text = money(latest)
        if name == "Rent":
            word = re.search(r"landlord", " ".join(tx.description for tx in series.charges), re.IGNORECASE)
            label = "Rent (LANDLORD)" if word else "Rent"
            if latest_salary:
                share = (latest / latest_salary * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
                amount_text += f", about **{share}%** of the {money(latest_salary.quantize(Decimal(1)))} salary"
        elif distinct >= 4:
            total = sum((tx.amount for tx in series.charges), _ZERO)
            amount_text = (
                f"about {money(_round_to(latest, 10))} ({money(total)} over {len(series.months)} "
                "months, varying monthly)"
            )
        elif _PROCESSOR_PREFIX.match(series.charges[0].description or "") and not series.charges[0].merchant_name:
            # A payee known only by its statement text keeps that spelling.
            label = _PROCESSOR_PREFIX.sub("", _statement_text(series.charges[0])).upper()
        rows.append((latest, Commitment(label, amount_text)))
    service = [tx for tx in txs if _is_service_charge(tx)]
    if service:
        latest_charge = max(service, key=lambda tx: tx.transaction_date).amount
        rows.append((latest_charge, Commitment("Account service charge", money(latest_charge))))
    rows.sort(key=lambda row: -row[0])
    return rows


def _salary_context(txs: list[FeatureTransaction]) -> list[str]:
    notes = []
    salaries = sorted(
        (tx for tx in txs if _klass(tx) == "income" and not _is_debit(tx) and "salary" in tx.description.lower()),
        key=lambda tx: tx.transaction_date,
    )
    if len(salaries) >= 3:
        first, last = salaries[0].amount, salaries[-1].amount
        if abs(last - first) / first >= Decimal("0.03"):
            change = next(tx for tx in salaries if tx.amount == last)
            word = "fell" if last < first else "rose"
            notes.append(
                f"salary {word} from {money(salaries[len(salaries) // 2 - 1].amount.quantize(Decimal(1)))} to "
                f"{money(last.quantize(Decimal(1)))} from {_MONTH_FULL[change.transaction_date.month]}."
            )
    for tx in txs:
        if not _is_debit(tx) and "employer" in (tx.description or "").lower():
            notes.append(
                f"A {money(tx.amount)} employer credit arrived in {_MONTH_FULL[tx.transaction_date.month]}."
            )
    return notes


def _near_misses(txs: list[FeatureTransaction], series_map: dict[str, _Series]) -> list[str]:
    notes = []
    labelled = []
    if any(name == "Rent" for name in series_map):
        labelled.append("Rent")
    for tx in txs:
        if _klass(tx) == "person_to_person" and _is_debit(tx):
            label = re.sub(r"\s*\(FP\)\s*", "", tx.description, flags=re.IGNORECASE).strip()
            if (
                tx.amount >= 10000
                and len(label) >= 4
                and not re.match(r"p\d|person|deposit|landlord", label, re.IGNORECASE)
            ):
                labelled.append(f'the {money(tx.amount)} "{label}" payment')
    trip_city = None
    for month in sorted({_month_key(tx.transaction_date) for tx in txs}):
        trip_city = _trip_city(txs, month) or trip_city
    if trip_city:
        labelled.append(f"the {trip_city.title()} restaurants")
    if labelled:
        notes.append(
            f"{_join(labelled)} {'is' if len(labelled) == 1 else 'are'} labelled or explained, so "
            f"{'it is' if len(labelled) == 1 else 'none is'} flagged as unusual."
        )
    for tx in txs:
        if not _is_debit(tx) or _klass(tx) in {"internal_transfer", "bank_fee"}:
            continue
        back = next(
            (
                other
                for other in txs
                if not _is_debit(other)
                and _amounts_equal(other.amount, tx.amount)
                and 0 < (other.transaction_date - tx.transaction_date).days <= 7
                and "debit order" in other.description.lower()
            ),
            None,
        )
        if back is not None:
            notes.append(
                f'The {money(tx.amount)} {tx.description} transfer on {_short_date(tx.transaction_date)} was '
                f'returned on {_short_date(back.transaction_date)} as a "{back.description}" credit, with no fee.'
            )
    for name, series in series_map.items():
        if not _is_monthly(series, 4):
            continue
        per_month = Counter(_month_key(tx.transaction_date) for tx in series.charges)
        doubled = [key for key, count in per_month.items() if count == 2]
        span = _consecutive(series.months)
        if doubled and len(series.charges) == len(span) and len({tx.amount for tx in series.charges}) <= 2:
            key = doubled[0]
            days = [tx.transaction_date.day for tx in series.charges if _month_key(tx.transaction_date) == key]
            count_word = _NUMBER_WORDS.get(len(series.charges), str(len(series.charges)))
            notes.append(
                f"{name} paid twice in {_month_name(key)} ({_ordinal(days[0])} and {_ordinal(days[1])}) "
                f"is timing, not a duplicate, because there were {count_word} payments in {count_word} months."
            )
    return notes


def _coverage(
    txs: list[FeatureTransaction],
    series_map: dict[str, _Series],
    round_trip: ReviewFinding | None,
    month_count: int,
    account_count: int,
    opaque: ReviewFinding | None,
) -> list[str]:
    notes = []
    # Other accounts the rows point at but the statements do not include: where money was
    # sent to, then lenders paid every month, then the customer's own accounts.
    biggest: dict[str, Decimal] = {}
    own_account = False
    for tx in txs:
        if _klass(tx) != "internal_transfer":
            continue
        if re.match(r"own account", tx.description, re.IGNORECASE):
            own_account = True
        else:
            biggest[tx.description] = max(biggest.get(tx.description, _ZERO), tx.amount)
    sweeps = [name for name, _ in sorted(biggest.items(), key=lambda item: (item[1], item[0]))]
    lenders = sorted(
        (
            series
            for name, series in series_map.items()
            if any(token in name.lower() for token in _LENDERS) and _is_monthly(series)
        ),
        key=lambda series: series.latest.amount,
    )
    ordered = [*sweeps, *[series.name for series in lenders]]
    if own_account:
        ordered.append("the OWN ACCOUNT destinations")
    prefix = "Only this account is visible." if account_count == 1 else f"Only {account_count} accounts are visible."
    notes.append(f"{prefix} {_join(ordered)} {'is' if len(ordered) == 1 else 'are'} not.")
    opaque_names = [n for n in ("Apple", "Google One", "Microsoft") if n in series_map]
    if opaque_names:
        shown = [n.replace(" One", "") for n in opaque_names]
        notes.append(f"{_join(shown)} descriptions don't say what was bought.")
    notes.append(
        f"{_NUMBER_WORDS.get(month_count, str(month_count)).capitalize()} months can't separate a "
        "seasonal spike from a trend."
        if month_count <= 6
        else ""
    )
    return [note for note in notes if note]


# ----------------------------------------------------------------------------- entry point


def build_statement_review(
    transactions: list[FeatureTransaction],
    context: StatementContext | None = None,
    answers: dict | None = None,
    *,
    ask_questions: bool = True,
) -> StatementReview:
    """The review, with the user's answers folded in.

    ``answers`` maps a question key to the user's latest answer or skip. Pass
    ``ask_questions=False`` when the answers could not be read: nothing is then asked.
    """
    from .statement_review_answers import apply_answers, choose_pending, open_questions
    from .spending_habits import (
        balance_findings,
        frequent_small_purchases,
        spending_habits,
        unexplained_small_debits,
    )

    ctx = context or StatementContext()
    # Every figure below is a magnitude; ``transaction_type`` carries the direction. Real
    # statement rows can hold a signed amount (a debit of -124.99), which made sums and
    # impacts negative and crashed the finding models (see amount_of in common.py).
    txs = sorted(
        (
            replace(tx, amount=abs(tx.amount)) if tx.amount < 0 else tx
            for tx in transactions
            if tx.transaction_date is not None
        ),
        key=lambda tx: (tx.transaction_date, tx.transaction_id),
    )
    # The fee-pairing step needs statement order within a day, so keep input order for ties.
    order = {tx.transaction_id: index for index, tx in enumerate(transactions)}
    txs.sort(key=lambda tx: (tx.transaction_date, order.get(tx.transaction_id, 0)))
    start = ctx.period_start or (txs[0].transaction_date if txs else None)
    end = ctx.period_end or (txs[-1].transaction_date if txs else None)
    month_count = max(1, round(((end - start).days) / 30.4)) if start and end else 1
    accounts = {tx.account_last4 or tx.account_id for tx in txs} - {None}
    account_count = len(accounts) or 1

    series_map = _series_by_payee(txs)
    fee_item, fee_rates = _fee_breakdown(txs, month_count)
    rises, drops = _price_changes(series_map)
    opaque = _opaque_billing(series_map)

    recoverable = [*_double_debit(series_map), *_paired_charges(series_map, fee_rates)]
    review_ordered: list[ReviewFinding | None] = [
        _implied_overdraft(txs, ctx, month_count),
        _round_trips(txs, ctx),
        *rises,
        fee_item,
        opaque,
        _cloud_overlap(series_map, opaque),
        _insurers(series_map),
        *_optional_charges(txs),
        *_unknown_recurring(series_map),
        *_trading(txs),
        _airtime_advances(txs),
        _delivery_habit(txs),
        *unexplained_small_debits(txs, month_count),
        balance_findings(txs),
    ]
    delivery = next((f for f in review_ordered if f and f.key == "food_delivery"), None)
    smaller = [
        _airtime(txs, series_map),
        _escalation(txs, ctx),
        _large_one_off(txs, series_map),
        *_repeat_payment(txs, series_map),
        # Where the money goes: the level of each habit, apart from any growth finding.
        *spending_habits(txs, month_count, delivery_raised=delivery is not None),
        *frequent_small_purchases(txs, month_count),
    ]
    round_trip = next((f for f in review_ordered if f and f.key == "round_trip_transfers"), None)
    findings = [
        *recoverable,
        *[f for f in review_ordered if f],
        *[f for f in smaller if f],
        *drops,
    ]
    commitment_rows = [row for _amount, row in _commitments(txs, series_map)]
    stored_answers = answers or {}
    findings, answer_notes = apply_answers(findings, stored_answers)
    questions = open_questions(findings, stored_answers) if ask_questions else []
    pending, not_shown = choose_pending(questions)
    return StatementReview(
        account_label=ctx.account_label or "Bank account",
        period_start=start,
        period_end=end,
        transaction_count=len(txs),
        month_count=month_count,
        account_count=account_count,
        facility=ctx.facility,
        reconciliation=_reconcile(txs, ctx),
        findings=findings,
        commitments=commitment_rows,
        context_notes=_salary_context(txs),
        near_misses=[*_near_misses(txs, series_map), *answer_notes],
        coverage_limits=_coverage(txs, series_map, round_trip, month_count, account_count, opaque),
        questions=questions,
        pending_questions=pending,
        questions_not_shown=not_shown,
        questions_asked=ask_questions,
    )


def _statement_month_of(tx: FeatureTransaction) -> str:
    """The statement a row belongs to. A service charge or interest posted on the 1st is for
    the month just ended, so it sits on that month's statement."""
    posted = tx.transaction_date
    description = (tx.description or "").lower()
    # Interest paid or received, and the monthly charge, post on the 1st for the month just ended.
    if posted.day == 1 and ("service charge" in description or "interest" in description):
        posted = posted - timedelta(days=1)
    return _month_key(posted)


def _reconcile(txs: list[FeatureTransaction], ctx: StatementContext) -> str | None:
    """Do the rows add up to what each statement says it charged, paid out and received?

    Two checks, each only when the statements printed the figures: fees and interest, and
    the money out and money in totals. A gap is explained only when a returned item accounts
    for it exactly; otherwise it is reported as a gap, never smoothed over.
    """
    parts = [_fee_reconciliation(txs, ctx), _totals_reconciliation(txs, ctx)]
    text = " ".join(part for part in parts if part)
    return text or None


def _fee_reconciliation(txs: list[FeatureTransaction], ctx: StatementContext) -> str | None:
    if not ctx.statement_fee_totals:
        return None
    # One printed total belongs to the whole statement, not to the calendar month of its date.
    if len(ctx.statement_fee_totals) == 1:
        expected = next(iter(ctx.statement_fee_totals.values()))
        charged = [tx for tx in txs if _is_fee(tx) and not _is_interest(tx)]
        net = sum((tx.amount for tx in _without_fees_credited_back(charged, txs)), _ZERO)
        if abs(net - expected) <= Decimal("0.005"):
            return "Bank fees add up to the statement's own total to the cent."
    fees: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    interest: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    for tx in txs:
        if not _is_fee(tx):
            continue
        key = _statement_month_of(tx)
        if _is_interest(tx):
            interest[key] += tx.amount
        else:
            fees[key] += tx.amount
    off = [
        key
        for key, expected in ctx.statement_fee_totals.items()
        if abs(fees.get(key, _ZERO) - expected) > Decimal("0.005")
    ]
    off += [
        key
        for key, expected in ctx.statement_interest_totals.items()
        if abs(interest.get(key, _ZERO) - expected) > Decimal("0.005")
    ]
    months = len(ctx.statement_fee_totals)
    if off:
        return (
            "Bank fees or interest do not add up to the statement's own totals for "
            + _join(sorted({_month_name(key) for key in off}))
            + ", so figures for those months may be incomplete."
        )
    return (
        "Bank fees and interest add up to each statement's own totals to the cent, in all "
        f"{months} months."
    )


def _returned_pair(txs: list[FeatureTransaction], month: str, amount: Decimal) -> tuple[FeatureTransaction, FeatureTransaction] | None:
    """A debit and an equal credit within a week of it, in this month: a returned item."""
    debits = [tx for tx in txs if _is_debit(tx) and _statement_month_of(tx) == month and tx.amount == amount]
    for debit in debits:
        for credit in txs:
            if (
                not _is_debit(credit)
                and credit.amount == amount
                and 0 < (credit.transaction_date - debit.transaction_date).days <= 7
            ):
                return debit, credit
    return None


def _totals_reconciliation(txs: list[FeatureTransaction], ctx: StatementContext) -> str | None:
    if not ctx.statement_debit_totals or not ctx.statement_credit_totals:
        return None
    out_rows: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    in_rows: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    for tx in txs:
        (out_rows if _is_debit(tx) else in_rows)[_statement_month_of(tx)] += tx.amount
    months = sorted(set(ctx.statement_debit_totals) & set(ctx.statement_credit_totals))
    if not months:
        return None
    tolerance = Decimal("0.005")
    matched = 0
    explained: list[str] = []
    unexplained: list[str] = []
    for month in months:
        out_gap = out_rows.get(month, _ZERO) - ctx.statement_debit_totals[month]
        in_gap = in_rows.get(month, _ZERO) - ctx.statement_credit_totals[month]
        if abs(out_gap) <= tolerance and abs(in_gap) <= tolerance:
            matched += 1
            continue
        pair = _returned_pair(txs, month, out_gap) if out_gap == in_gap and out_gap > 0 else None
        if pair is not None:
            debit, credit = pair
            explained.append(
                f"In {_month_name(month)} the rows are {money(out_gap)} higher than the statement "
                f"totals on both sides. That is the {money(out_gap)} {debit.description} transfer on "
                f"{_short_date(debit.transaction_date)}, returned on {_short_date(credit.transaction_date)}: "
                "the bank leaves both out of its totals."
            )
        else:
            unexplained.append(_month_name(month))
    if matched == len(months):
        return (
            "Money out and money in add up to every statement's totals to the cent, in all "
            f"{len(months)} months."
        )
    sentences = []
    if matched:
        sentences.append(
            "Money out and money in add up to the statement totals to the cent in "
            f"{matched} of {len(months)} months."
        )
    sentences.extend(explained)
    if unexplained:
        sentences.append(
            "Money out or money in does not add up to the statement totals for "
            + _join(unexplained)
            + ", so rows may be missing or repeated in those months."
        )
    return " ".join(sentences)
