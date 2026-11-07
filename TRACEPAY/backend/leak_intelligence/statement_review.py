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
from dataclasses import dataclass, field
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
    return StatementContext(
        account_label=account_label,
        # Statements are monthly: the period runs from the first of the earliest month
        # to the last statement date.
        period_start=date(first_month.year, first_month.month, 1),
        period_end=usable[-1][0],
        debit_interest_rates=rates,
        credit_interest_rate=_printed_decimal(latest.get("credit_interest_rate")),
        facility=_printed_decimal(latest.get("facility")),
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
    )
)
_DELIVERY = re.compile(r"uber\s*eats|\bdl\W*uber", re.IGNORECASE)
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


def payee_name(tx: FeatureTransaction) -> str:
    """How the customer would name who was paid. Stable across a payee's own spellings."""
    description = tx.description or ""
    if _DELIVERY.search(description):
        return "Uber Eats"
    if re.search(r"landlord|\brent\b", description, re.IGNORECASE) and _is_debit(tx):
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


def _is_fee(tx: FeatureTransaction) -> bool:
    return _klass(tx) == "bank_fee" and _is_debit(tx)


def _is_interest(tx: FeatureTransaction) -> bool:
    return _is_fee(tx) and "interest" in (tx.description or "").lower()


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
            or (_klass(tx) == "person_to_person" and _RENT_WORDS.search(tx.description or ""))
        )
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
        grouped[payee_name(tx)].append(tx)
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
            earlier = [key for key in series.months if key < month]
            if len(earlier) < 3:
                continue
            span = _consecutive(earlier)
            if any(key not in earlier for key in span):
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


def _paired_charges(series_map: dict[str, _Series], fee_rate_by_payee: dict[str, Decimal]) -> list[ReviewFinding]:
    """The same amount charged twice within three days, month after month."""
    findings = []
    for name, series in series_map.items():
        by_amount_month: dict[tuple[Decimal, str], list[date]] = defaultdict(list)
        for tx in series.charges:
            by_amount_month[(tx.amount, _month_key(tx.transaction_date))].append(tx.transaction_date)
        paired: dict[Decimal, dict[str, list[date]]] = defaultdict(dict)
        for (amount, month), days in by_amount_month.items():
            days.sort()
            if len(days) >= 2 and (days[-1] - days[0]).days <= 3:
                paired[amount][month] = days
        paired = {amount: months for amount, months in paired.items() if len(months) >= 2}
        if not paired:
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
                    f"**twice within 3 days** around the {spans}. That is {pair_count} pairs, with "
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


def _fee_breakdown(
    txs: list[FeatureTransaction], month_count: int
) -> tuple[ReviewFinding | None, dict[str, Decimal]]:
    fees = [tx for tx in txs if _is_fee(tx) and not _is_interest(tx)]
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
    if other:
        names = " and ".join(
            label
            for label, token in (("Faster Payment", "faster payment"), ("PayShap", "shap"))
            if any(token in tx.description.lower() for tx in other)
        ) or "Payment"
        extra = ""
        biggest = max(other, key=lambda tx: tx.amount)
        typical = Decimal(str(median(tx.amount for tx in other)))
        if biggest.amount >= typical * 3:
            ordered_all = list(txs)
            index = ordered_all.index(biggest)
            paid = ordered_all[index - 1] if index > 0 else None
            if (
                paid is not None
                and _is_debit(paid)
                and paid.transaction_date == biggest.transaction_date
                and _klass(paid) == "person_to_person"
            ):
                label = re.sub(r"\s*\(FP\)\s*", "", paid.description, flags=re.IGNORECASE).strip()
                extra = f' (including {money(biggest.amount)} on the {money(paid.amount)} "{label}" payment)'
        parts.append(f"{names} fees {money(sum((tx.amount for tx in other), _ZERO))}{extra}.")

    finding = ReviewFinding(
        key="bank_fees",
        group="review",
        leak_type="bank_fee_leak",
        title="Bank fees, itemised",
        display="table",
        shows=f"{money(total)} over {month_count} months. " + " ".join(parts),
        cannot_show="Whether a cheaper account tier suits you.",
        figures={"total": total, "service": sum((tx.amount for tx in service), _ZERO)},
        rows=[
            evidence_row(
                tx,
                "service charge" if tx in service else "cross-border fee" if tx in cross else "payment fee",
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
    total = sum((tx.amount for tx in interest), _ZERO)
    monthly = (total / month_count).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    sentences = [f"{money(total)} over {month_count} months (about {money(monthly)}/month)."]
    rates_by_month: dict[str, Decimal] = {}
    balances: list[Decimal] = []
    for tx in sorted(interest, key=lambda item: item.transaction_date):
        # Interest posts on the first of the next month, for the month just ended.
        month = _month_key(tx.transaction_date - timedelta(days=1))
        rate = ctx.debit_interest_rates.get(month)
        if rate:
            rates_by_month[month] = rate
            balances.append(tx.amount / (rate / 12 / 100))
    if rates_by_month:
        keys = sorted(rates_by_month)
        first, last = rates_by_month[keys[0]], rates_by_month[keys[-1]]
        if first != last:
            change_key = next(key for key in keys if rates_by_month[key] != first)
            sentences.append(
                f"The rate went from {first:.2f}% to **{last:.2f}%** in {_month_name(change_key)}."
            )
        low, high = min(balances), max(balances)
        near = ""
        if ctx.facility and high >= ctx.facility * Decimal("0.9"):
            near = f", at or near the {_kilo(ctx.facility)} limit"
        sentences.append(
            f"The interest implies an average overdraft of about "
            f"R{_round_to(low, 1000) / 1000:.0f}–{_round_to(high, 1000) / 1000:.0f}k{near}."
        )
    return ReviewFinding(
        key="overdraft_interest",
        group="review",
        leak_type="high_cost_credit_leak",
        title="Overdraft interest",
        display="table",
        shows=" ".join(sentences),
        cannot_show="Whether the cash you move around sits idle elsewhere.",
        figures={"total": total, "months": month_count},
        rows=evidence_rows(interest, "interest"),
    )


def _round_trips(txs: list[FeatureTransaction], ctx: StatementContext) -> ReviewFinding | None:
    """Money sent to the customer's own accounts that comes back within days."""
    out_by_month: dict[str, list[FeatureTransaction]] = defaultdict(list)
    incoming = [tx for tx in txs if _klass(tx) == "internal_transfer" and not _is_debit(tx)]
    for tx in txs:
        if _klass(tx) == "internal_transfer" and _is_debit(tx):
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
    orders = [tx for tx in _purchases(txs) if _DELIVERY.search(tx.description or "")]
    if len(orders) < 10:
        return None
    total = sum((tx.amount for tx in orders), _ZERO)
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
        title="Uber Eats",
        display="table",
        shows=" ".join(sentences),
        cannot_show="Delivery and service fees inside each total.",
        figures={"orders": len(orders), "total": total},
        rows=evidence_rows(orders, "order"),
    )


def _airtime(txs: list[FeatureTransaction], series_map: dict[str, _Series]) -> ReviewFinding | None:
    top_ups = [
        tx
        for tx in _purchases(txs)
        if re.match(r"vas\s", tx.description or "", re.IGNORECASE)
        or "airtime" in (tx.description or "").lower()
    ]
    if not top_ups:
        return None
    contract = next(
        (s for name, s in series_map.items() if any(t in name.lower() for t in _TELECOMS) and _is_monthly(s)),
        None,
    )
    listed = _join([f"{money(tx.amount)} ({_MONTH_ABBR[tx.transaction_date.month]})" for tx in top_ups])
    tail = f" on top of a {money(contract.regular_amount)}/month {contract.name} payment" if contract else ""
    return ReviewFinding(
        key="airtime",
        group="review",
        leak_type="airtime_data_leak",
        title="Airtime and data",
        display="item",
        line=f"**Airtime and data:** {listed}{tail} (`airtime_data_leak`, low).",
        figures={"total": sum((tx.amount for tx in top_ups), _ZERO)},
        rows=evidence_rows(top_ups, "top-up"),
    )


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

    ctx = context or StatementContext()
    txs = sorted(
        (tx for tx in transactions if tx.transaction_date is not None),
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
        *_unknown_recurring(series_map),
        _delivery_habit(txs),
    ]
    smaller = [
        _airtime(txs, series_map),
        _escalation(txs, ctx),
        _large_one_off(txs, series_map),
        *_repeat_payment(txs, series_map),
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
