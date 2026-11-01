"""A second benchmark that does not hand the engine tidy data.

Unlike ``customers.py``, nothing here is pre-categorised: each row has only the
raw bank description and goes through the real classifier, so merchant
normalisation, fee recognition and refund detection are part of what is tested.
It uses noisy and inconsistent descriptions, a missing statement month, two
accounts, an unfamiliar merchant and a realistic month-to-month spread of
ordinary spending.

Expectations were written before the engine was run and are not adjusted to
its output.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date, time
from decimal import Decimal

from categorisation.classifier import classify_transaction
from leak_intelligence.models import FeatureTransaction
from tests.benchmark.customers import Customer, Expected

D = Decimal


def raw(
    tx_id: str,
    amount: str,
    when: date,
    description: str,
    direction: str = "debit",
    *,
    account: str | None = None,
    at: time | None = None,
) -> FeatureTransaction:
    """A row with only what a statement gives: description, amount, date, direction."""
    result = classify_transaction(description, direction)
    return FeatureTransaction(
        transaction_id=tx_id,
        user_id="user-a",
        amount=D(amount),
        transaction_date=when,
        transaction_time=at,
        merchant_name=result.merchant_name,
        description=description,
        transaction_type=direction,  # type: ignore[arg-type]
        categorisation=result,
        account_id=account,
    )


def _noisy_lifestyle() -> list[FeatureTransaction]:
    """Six months of ordinary spending that varies the way real spending does."""
    rows: list[FeatureTransaction] = []
    stores = ["SPAR", "CHECKERS HYPER", "PICK N PAY", "WOOLWORTHS FOOD"]
    fuel = ["ENGEN 1 STOP", "SHELL ULTRA CITY"]
    for index, month in enumerate(range(4, 10)):
        rows.append(raw(f"sal{month}", "26500", date(2026, month, 25), "SALARY ACME HOLDINGS", "credit"))
        for week in range(4):
            amount = 280 + ((index * 37 + week * 53) % 190)
            rows.append(
                raw(f"g{month}{week}", f"{amount}.{(index * 7 + week * 3) % 100:02d}", date(2026, month, 3 + week * 7),
                    f"{stores[(index + week) % 4]} #{4400 + month}{week}")
            )
        rows.append(raw(f"f{month}", str(650 + (index * 41) % 220), date(2026, month, 9), f"{fuel[index % 2]} {month}"))
        rows.append(raw(f"r{month}", str(210 + (index * 29) % 160), date(2026, month, 16 + index % 5), "NANDOS SANDTON"))
        rows.append(raw(f"a{month}", str(100 + (index % 3) * 50), date(2026, month, 12 + index % 6), "MTN PREPAID AIRTIME"))
    return rows


def _stationary_lifestyle() -> list[FeatureTransaction]:
    """Six months of ordinary spending that varies up and down without a trend.

    Added after the first run showed that ``_noisy_lifestyle`` rises every month
    (its amounts come from a modulo that climbs through the window), so it is not
    the stationary variation it was meant to be. That customer and its result are
    kept as they were; this one has fixed, trendless amounts.
    """
    groceries = [
        [412, 355, 468, 390],
        [371, 440, 349, 425],
        [455, 380, 402, 361],
        [388, 462, 357, 430],
        [419, 366, 451, 377],
        [394, 433, 372, 458],
    ]
    fuel = [720, 690, 810, 700, 760, 740]
    restaurant = [260, 310, 240, 335, 280, 295]
    airtime = [100, 150, 100, 100, 150, 100]
    stores = ["SPAR", "CHECKERS HYPER", "PICK N PAY", "WOOLWORTHS FOOD"]
    rows: list[FeatureTransaction] = []
    for index, month in enumerate(range(4, 10)):
        rows.append(raw(f"sal{month}", "26500", date(2026, month, 25), "SALARY ACME HOLDINGS", "credit"))
        for week, amount in enumerate(groceries[index]):
            rows.append(
                raw(f"g{month}{week}", str(amount), date(2026, month, 3 + week * 7),
                    f"{stores[(index + week) % 4]} #{4400 + month}{week}")
            )
        rows.append(raw(f"f{month}", str(fuel[index]), date(2026, month, 9), f"{['ENGEN 1 STOP', 'SHELL ULTRA CITY'][index % 2]} {month}"))
        rows.append(raw(f"r{month}", str(restaurant[index]), date(2026, month, 17), "NANDOS SANDTON"))
        rows.append(raw(f"a{month}", str(airtime[index]), date(2026, month, 13), "MTN PREPAID AIRTIME"))
    return rows


def build_noisy_customers() -> list[Customer]:
    customers: list[Customer] = []

    # N1. One subscription, six different descriptors.
    descriptors = [
        "NETFLIX.COM",
        "NETFLIX ZA 4482",
        "Netflix.com*8-BIT SG",
        "NETFLIX PAYMENT",
        "NETFLIX SUBSCRIPTION",
        "NETFLIX.COM 800-123",
    ]
    customers.append(
        Customer(
            "N01-noisy-subscription-descriptors",
            "Merchant normalisation across descriptors",
            [raw(f"n{i}", "199", date(2026, 4 + i, 5), text) for i, text in enumerate(descriptors)],
            [Expected("subscription_leak", "subscription_review", "NETFLIX", monthly_impact=D("199.00"))],
        )
    )

    # N2. A missing statement month must not break a subscription or look like a cancellation.
    customers.append(
        Customer(
            "N02-missing-month",
            "Missing statement month",
            [raw(f"s{m}", "80", date(2026, m, 9), "SPOTIFY P1A2B3") for m in (4, 5, 7, 8, 9)],
            [Expected("subscription_leak", "subscription_review", "SPOTIFY", monthly_impact=D("80.00"))],
        )
    )

    # N3. One subscription moves between accounts; money moves between own accounts.
    moved = [
        raw(f"a{m}", "199", date(2026, m, 5), "NETFLIX.COM", account="acc-a") for m in (4, 5, 6)
    ] + [raw(f"b{m}", "199", date(2026, m, 5), "NETFLIX.COM", account="acc-b") for m in (7, 8, 9)]
    moved += [
        raw("tx-out", "3000", date(2026, 6, 20), "IB TRANSFER TO 1234 SAVINGS", account="acc-a"),
        raw("tx-in", "3000", date(2026, 6, 20), "IB TRANSFER FROM 1234 CURRENT", "credit", account="acc-b"),
    ]
    customers.append(
        Customer(
            "N03-two-accounts",
            "Multiple accounts",
            moved,
            [Expected("subscription_leak", "subscription_review", "NETFLIX", monthly_impact=D("199.00"))],
            note="One subscription that moved cards is one subscription, not a duplicate.",
        )
    )

    # N4. An unfamiliar merchant charging every month.
    customers.append(
        Customer(
            "N04-unfamiliar-merchant",
            "Unfamiliar merchant",
            [raw(f"k{m}", "250", date(2026, m, 14), f"KAMOHELO TRADING CC {7700 + m}") for m in range(4, 9)],
            [Expected("unknown_recurring_payment", None, None, monthly_impact=D("250"))],
        )
    )

    # N5. Two different orders on one day are not a duplicate.
    customers.append(
        Customer(
            "N05-two-orders-same-day",
            "Different order references",
            [
                raw("o1", "349", date(2026, 8, 18), "TAKEALOT.COM ORDER 884211", at=time(12, 0)),
                raw("o2", "349", date(2026, 8, 18), "TAKEALOT.COM ORDER 884377", at=time(12, 2)),
                raw("g1", "420", date(2026, 9, 30), "CHECKERS HYPER"),
            ],
            [],
        )
    )

    # N6. The same order charged twice a minute apart is a duplicate.
    customers.append(
        Customer(
            "N06-same-order-charged-twice",
            "True duplicate with noisy description",
            [
                raw("d1", "349", date(2026, 8, 18), "TAKEALOT.COM ORDER 884211", at=time(12, 0)),
                raw("d2", "349", date(2026, 8, 18), "TAKEALOT.COM ORDER 884211", at=time(12, 1)),
                raw("g1", "420", date(2026, 9, 30), "CHECKERS HYPER"),
            ],
            [Expected("duplicate_payment_leak", "duplicate_merchant_payment", "TAKEALOT", monthly_impact=D("349"))],
        )
    )

    # N7. An introductory price ending is not a price rise.
    customers.append(
        Customer(
            "N07-promotional-price-ends",
            "Introductory price",
            [raw(f"p{i}", amount, date(2026, 4 + i, 5), "SHOWMAX") for i, amount in enumerate(["29", "99", "99", "99", "99"])],
            [Expected("subscription_leak", "subscription_review", "SHOWMAX", monthly_impact=D("99.00"))],
            note="The finding is the R99 subscription, not a R70 'price rise'.",
        )
    )

    # N8. A purchase reversed and bought again.
    customers.append(
        Customer(
            "N08-reversed-and-repurchased",
            "Reversal with noisy description",
            [
                raw("b1", "450", date(2026, 7, 11), "WOOLWORTHS 4482 CAPE TOWN"),
                raw("b1r", "450", date(2026, 7, 11), "REVERSAL WOOLWORTHS 4482", "credit"),
                raw("b2", "450", date(2026, 7, 11), "WOOLWORTHS 4482 CAPE TOWN"),
                raw("g1", "120", date(2026, 8, 20), "CHECKERS HYPER"),
                raw("g2", "135", date(2026, 9, 15), "CHECKERS HYPER"),
            ],
            [],
        )
    )

    # N9. The same fee under six wordings.
    wordings = [
        "IMMEDIATE PAYMENT FEE",
        "FEE: IMMEDIATE PAYMENT",
        "Immediate Payment Fee",
        "IB IMMEDIATE PAYMENT FEE",
        "IMMEDIATE PAYMENT FEE 4482",
        "IMMEDIATE PAYMENT FEE-ACB",
    ]
    fees = [
        raw(f"if{m}{i}", "10", date(2026, m, 2 + i), text)
        for m in (6, 7, 8, 9)
        for i, text in enumerate(wordings)
    ]
    fees.append(raw("z", "50", date(2026, 10, 3), "CHECKERS HYPER"))
    customers.append(
        Customer(
            "N09-fee-wordings",
            "Fee descriptor variants",
            fees,
            [Expected("bank_fee_leak", "immediate_payment_fee", None, monthly_impact=D("60"))],
        )
    )

    # N10. Ordinary life, no leak: salary, groceries, fuel, a restaurant, airtime.
    customers.append(
        Customer(
            "N10-ordinary-spending",
            "Realistic month-to-month variation",
            _noisy_lifestyle(),
            [],
            note=(
                "Intended as ordinary variation. On inspection after the first run its amounts rise "
                "every month (restaurants +69%, fuel +31%), so the two category findings are "
                "defensible and this customer is not a clean false-positive measure. Kept unchanged."
            ),
        )
    )

    # N11. Ordinary life with trendless variation: no leak.
    customers.append(
        Customer(
            "N11-stationary-spending",
            "Trendless month-to-month variation",
            _stationary_lifestyle(),
            [],
            note="Spending that moves up and down around a level is not a leak.",
        )
    )

    return customers


__all__ = ["build_noisy_customers", "raw", "replace"]
