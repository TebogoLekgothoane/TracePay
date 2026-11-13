"""Forty more noisy customers, written to widen the noisy benchmark past 50.

Same rules as ``noisy_customers.py``: every row is a raw bank description that goes
through the real classifier, and the expectations say what an analyst would
conclude from the statement. They were written before the engine was run and are
not adjusted to its output; where the engine disagrees the disagreement is recorded
in ``tests/test_noisy_benchmark.py`` with a cause, not edited away here.

Ordinary spending comes from ``_lifestyle``, which draws each month's amounts around
a fixed level with a seeded generator, so it moves up and down without a trend.
"""

from __future__ import annotations

import random
from datetime import date, time
from decimal import Decimal

from leak_intelligence.models import FeatureTransaction
from tests.benchmark.customers import Customer, Expected
from tests.benchmark.noisy_customers import raw

D = Decimal
MONTHS = range(4, 10)  # April to September 2026


def _lifestyle(seed: int, scale: float = 1.0) -> list[FeatureTransaction]:
    """Six months of salary, groceries, fuel, a restaurant and airtime. No trend."""
    rng = random.Random(seed)
    stores = ["SPAR", "CHECKERS HYPER", "PICK N PAY", "WOOLWORTHS FOOD"]
    fuel = ["ENGEN 1 STOP", "SHELL ULTRA CITY", "SASOL GARSFONTEIN"]
    rows: list[FeatureTransaction] = []
    for month in MONTHS:
        rows.append(raw(f"sal{month}", "26500", date(2026, month, 25), "SALARY ACME HOLDINGS", "credit"))
        for week in range(4):
            amount = round(400 * scale * rng.uniform(0.88, 1.12), 2)
            rows.append(
                raw(f"g{month}{week}", f"{amount:.2f}", date(2026, month, 3 + week * 7),
                    f"{rng.choice(stores)} #{4400 + month}{week}")
            )
        rows.append(raw(f"f{month}", f"{round(720 * scale * rng.uniform(0.9, 1.1))}", date(2026, month, 9),
                        f"{rng.choice(fuel)} {month}"))
        rows.append(raw(f"r{month}", f"{round(280 * scale * rng.uniform(0.85, 1.15))}", date(2026, month, 17),
                        "NANDOS SANDTON"))
        rows.append(raw(f"a{month}", str(rng.choice([100, 100, 150])), date(2026, month, 13), "MTN PREPAID AIRTIME"))
    return rows


def _monthly(prefix, amount, descriptions, *, day=5, months=MONTHS, jitter=0, seed=0, direction="debit"):
    """One charge a month. ``descriptions`` is cycled; ``jitter`` moves the day by up to that many."""
    rng = random.Random(seed)
    rows = []
    for index, month in enumerate(months):
        moved = max(1, min(28, day + (rng.randint(-jitter, jitter) if jitter else 0)))
        text = descriptions[index % len(descriptions)] if isinstance(descriptions, list) else descriptions
        rows.append(raw(f"{prefix}{month}", str(amount), date(2026, month, moved), text, direction))
    return rows


def build_extra_noisy_customers() -> list[Customer]:
    c: list[Customer] = []

    def add(name, covers, rows, expected=(), note=""):
        c.append(Customer(name, covers, list(rows), list(expected), note=note))

    # --- Subscriptions inside ordinary life -----------------------------------------
    add("N12-spotify-in-lifestyle", "Subscription among ordinary spending", [
        *_lifestyle(12), *_monthly("sp", "70", ["SPOTIFY P2C9D1", "SPOTIFY AB STOCKHOLM", "SPOTIFY P3F1A2"], day=11)],
        [Expected("subscription_leak", "subscription_review", "SPOTIFY", monthly_impact=D("70"))])
    add("N13-youtube-premium", "Subscription billed through Google", [
        *_lifestyle(13), *_monthly("yt", "89.99", ["GOOGLE *YOUTUBE PREMIUM", "GOOGLE*YOUTUBEPREMIUM G.CO"], day=8)],
        [Expected("subscription_leak", "subscription_review", None, monthly_impact=D("89.99"))])
    add("N14-dstv", "Pay-TV subscription", [
        *_lifestyle(14), *_monthly("ds", "499", ["DSTV SUBSCRIPTION", "MULTICHOICE DSTV"], day=1, jitter=1, seed=14)],
        [Expected("subscription_leak", "subscription_review", None, monthly_impact=D("499"))])
    add("N15-icloud-storage", "App-store billing", [
        *_lifestyle(15), *_monthly("ic", "14.99", ["APPLE.COM/BILL", "APPLE.COM/BILL ITUNES.COM"], day=19)],
        [Expected("subscription_leak", "subscription_review", None, monthly_impact=D("14.99"))],
        note="R14.99 is a real iCloud plan, so the finding is the recurring charge, small as it is.")
    add("N16-microsoft-365", "Software subscription", [
        *_lifestyle(16), *_monthly("ms", "159", ["MICROSOFT*MICROSOFT 365", "MSFT *MICROSOFT 365 MSBILL.INFO"], day=22)],
        [Expected("subscription_leak", "subscription_review", None, monthly_impact=D("159"))])
    add("N17-disney-plus", "Streaming subscription", [
        *_lifestyle(17), *_monthly("dp", "99", ["DISNEYPLUS", "DISNEY PLUS ZA"], day=14)],
        [Expected("subscription_leak", "subscription_review", None, monthly_impact=D("99"))])
    add("N18-prime-video", "Streaming subscription", [
        *_lifestyle(18), *_monthly("pv", "79", ["AMZN PRIME VIDEO", "PRIME VIDEO*AMZN"], day=3)],
        [Expected("subscription_leak", "subscription_review", None, monthly_impact=D("79"))])
    add("N19-two-subscriptions", "Two separate subscriptions", [
        *_lifestyle(19), *_monthly("nf", "199", ["NETFLIX.COM", "NETFLIX ZA 4482"], day=6),
        *_monthly("sp", "70", "SPOTIFY P2C9D1", day=15)],
        [Expected("subscription_leak", "subscription_review", "NETFLIX", monthly_impact=D("199")),
         Expected("subscription_leak", "subscription_review", "SPOTIFY", monthly_impact=D("70"))])
    add("N20-netflix-price-rise", "Price rise mid-statement", [
        *_lifestyle(20), *(raw(f"nf{m}", amount, date(2026, m, 6), "NETFLIX.COM")
                           for m, amount in zip(MONTHS, ["159", "159", "159", "199", "199", "199"]))],
        [Expected("subscription_leak", "subscription_review", "NETFLIX")])
    add("N21-weekend-billing-drift", "Billing date drifts around weekends", [
        *_lifestyle(21), *_monthly("nf", "199", "NETFLIX.COM", day=5, jitter=2, seed=21)],
        [Expected("subscription_leak", "subscription_review", "NETFLIX", monthly_impact=D("199"))])
    add("N22-subscription-two-months-only", "Too little history for a subscription", [
        raw("n1", "199", date(2026, 8, 5), "NETFLIX.COM"), raw("n2", "199", date(2026, 9, 5), "NETFLIX.COM")], [],
        note="Two charges are not yet a pattern.")

    # --- Duplicates --------------------------------------------------------------------
    add("N23-uber-eats-double-charge", "Same meal charged twice a minute apart", [
        *_lifestyle(23),
        raw("u1", "189", date(2026, 7, 18), "UBER EATS HELP.UBER.COM", at=time(19, 4)),
        raw("u2", "189", date(2026, 7, 18), "UBER EATS HELP.UBER.COM", at=time(19, 5))],
        [Expected("duplicate_payment_leak", "duplicate_merchant_payment", None, monthly_impact=D("189"))])
    add("N24-sixty60-double-charge", "Grocery order charged twice", [
        *_lifestyle(24),
        raw("c1", "312.45", date(2026, 8, 14), "CHECKERS SIXTY60 1883", at=time(18, 30)),
        raw("c2", "312.45", date(2026, 8, 14), "CHECKERS SIXTY60 1883", at=time(18, 31))],
        [Expected("duplicate_payment_leak", "duplicate_merchant_payment", None, monthly_impact=D("312.45"))])
    add("N25-two-coffees", "Two identical small purchases hours apart", [
        *_lifestyle(25),
        raw("k1", "45", date(2026, 8, 12), "VIDA E CAFFE V&A", at=time(8, 40)),
        raw("k2", "45", date(2026, 8, 12), "VIDA E CAFFE V&A", at=time(14, 15))], [],
        note="Two coffees in one day is ordinary, not a duplicate charge.")
    add("N26-double-debit-order", "A premium taken twice in one month", [
        *_monthly("om", "450", "OLD MUTUAL PREMIUM", day=1, months=range(4, 10)),
        raw("om-x", "450", date(2026, 7, 2), "OLD MUTUAL PREMIUM")],
        [Expected("duplicate_debit_order_leak", "duplicate_debit_order", None, monthly_impact=D("450"))],
        note="The statement row carries no 'DEBIT ORDER' wording, so the engine cannot tell this is a collection.")

    add("N53-double-debit-order-marked", "The same premium collected twice, worded as a debit order", [
        *_monthly("om", "450", "DEBIT ORDER OLD MUTUAL PREMIUM", day=1),
        raw("om-x", "450", date(2026, 7, 2), "DEBIT ORDER OLD MUTUAL PREMIUM")],
        [Expected("duplicate_debit_order_leak", "duplicate_debit_order", None, monthly_impact=D("450"))],
        note="N26 has the same rows without the 'DEBIT ORDER' wording a bank prints on a collection.")

    # --- Bank fees -----------------------------------------------------------------------
    add("N27-three-instant-payments-a-month", "Repeated immediate payment fees", [
        *_lifestyle(27),
        *(raw(f"if{m}{i}", "12", date(2026, m, 3 + i * 6), "IMMEDIATE PAYMENT FEE") for m in MONTHS for i in range(3))],
        [Expected("bank_fee_leak", "immediate_payment_fee", None, monthly_impact=D("36"))])
    add("N28-card-abroad-fees", "Foreign transaction fee each month", [
        *_lifestyle(28),
        *(raw(f"fx{m}", "28", date(2026, m, 10), "INTERNATIONAL TRANSACTION FEE") for m in range(6, 10))],
        [Expected("bank_fee_leak", "foreign_transaction_fee", None, monthly_impact=D("28"))])
    add("N29-flat-account-fee", "A fixed monthly account fee", [
        *_lifestyle(29), *_monthly("fee", "69", "MONTHLY ACCOUNT FEE", day=1)], [],
        note="Ordinary banking, not a leak.")
    add("N30-one-card-replacement", "A single one-off fee", [
        *_lifestyle(30), raw("cr", "150", date(2026, 7, 20), "CARD REPLACEMENT FEE")], [])
    add("N31-card-interest", "Interest on a credit card at irregular amounts", [
        *_lifestyle(31),
        *(raw(f"int{i}", amount, date(2026, 6 + i, 28), "INTEREST CHARGED")
          for i, amount in enumerate(["180", "95", "240", "60"]))],
        [Expected("bank_fee_leak", "interest_charges", None, observed_total=D("575"))])
    add("N32-overdraft-fees", "Overdraft fee every month", [
        *_lifestyle(32),
        *(raw(f"od{m}", "85", date(2026, m, 27), "OVERDRAFT FEE") for m in range(6, 10))],
        [Expected("bank_fee_leak", None, None, monthly_impact=D("85"))])
    add("N33-atm-fees-normal-use", "A cash withdrawal and its fee once a month", [
        *_lifestyle(33),
        *(raw(f"w{m}", "500", date(2026, m, 15), "ATM WITHDRAWAL SANDTON") for m in MONTHS),
        *(raw(f"wf{m}", "9.50", date(2026, m, 15), "ATM WITHDRAWAL FEE") for m in MONTHS)], [],
        note="One ordinary withdrawal a month is not fee stacking.")

    # --- Penalties, credit, gambling -------------------------------------------------------
    add("N34-vodacom-late-fee", "Late fee on a contract", [
        *_lifestyle(34),
        *(raw(f"v{m}", "549", date(2026, m, 3), "VODACOM CONTRACT") for m in range(5, 10)),
        raw("late", "95", date(2026, 7, 19), "VODACOM LATE PAYMENT FEE")],
        [Expected("penalty_fee_leak", "penalty_fees", "VODACOM", monthly_impact=D("95")),
         Expected("recurring_payment_leak", None, "VODACOM", monthly_impact=D("549"))])
    add("N35-regular-betting", "Weekly betting deposits", [
        *_lifestyle(35),
        *(raw(f"b{i}", str(amount), date(2026, month, day), f"HOLLYWOODBETS ONLINE {4400 + i}")
          for i, (month, day, amount) in enumerate(
              [(4, 3, 200), (4, 17, 250), (5, 2, 300), (5, 20, 200), (6, 5, 350), (6, 22, 250),
               (7, 4, 300), (7, 19, 250)]))],
        [Expected("gambling_spending_leak", "gambling_spending", "HOLLYWOODBETS", observed_total=D("2100"))])
    add("N36-three-small-bets", "A few small bets", [
        *_lifestyle(36),
        raw("b1", "50", date(2026, 4, 10), "BETWAY ONLINE"), raw("b2", "40", date(2026, 6, 12), "BETWAY ONLINE"),
        raw("b3", "30", date(2026, 8, 14), "BETWAY ONLINE")], [])
    add("N37-short-term-lender", "Monthly short-term loan repayments", [
        *_lifestyle(37), *_monthly("fb", "520", "FINBOND LOAN REPAYMENT", day=25)],
        [Expected("high_cost_credit_leak", "high_cost_lender_repayments", "FINBOND", monthly_impact=D("520"))])

    # --- Unfamiliar recurring merchants ---------------------------------------------------------
    add("N38-unknown-enterprises", "Unfamiliar monthly debit", [
        *_lifestyle(38), *_monthly("tj", "340", ["TJ ENTERPRISES 8821", "TJ ENTERPRISES 8824"], day=14, months=range(5, 10))],
        [Expected("unknown_recurring_payment", None, None, monthly_impact=D("340"))])
    add("N39-unknown-solutions", "Unfamiliar monthly debit, small", [
        *_lifestyle(39), *_monthly("bb", "120", "BLUEBIRD SOLUTIONS PTY", day=21, months=range(5, 10))],
        [Expected("unknown_recurring_payment", None, None, monthly_impact=D("120"))])

    # --- Ordinary life: nothing to find -------------------------------------------------------------
    for number, (seed, scale, label) in enumerate(
        [(40, 1.0, "average household"), (41, 1.6, "high spender"), (42, 0.6, "low spender"),
         (43, 1.0, "average household B"), (44, 1.3, "above average"), (45, 0.8, "below average")]
    ):
        add(f"N{40 + number}-ordinary-{label.replace(' ', '-')}", f"Trendless ordinary spending: {label}",
            _lifestyle(seed, scale), [], note="Spending that moves around a level is not a leak.")
    add("N46-big-grocery-shop", "One large grocery shop", [
        *_lifestyle(46), raw("big", "1850.00", date(2026, 8, 30), "CHECKERS SIXTY60 1883")], [],
        note="Groceries are essential spending; a big shop is not an unusual transaction.")
    add("N47-rent-to-landlord", "Rent paid by EFT to a person", [
        *_lifestyle(47), *_monthly("rent", "8500", "IB PAYMENT TO J DLAMINI RENT", day=1)], [],
        note="Rent is a housing cost the customer has to pay, not a leak.")
    add("N48-monthly-savings-transfer", "Money moved to savings each month", [
        *_lifestyle(48), *_monthly("sv", "2000", "IB TRANSFER TO 7781 SAVINGS", day=26)], [],
        note="Saving is not a leak.")
    add("N49-purchase-then-refund", "A refunded purchase", [
        *_lifestyle(49),
        raw("p", "899", date(2026, 7, 8), "TAKEALOT.COM ORDER 551203"),
        raw("pr", "899", date(2026, 7, 19), "TAKEALOT.COM REFUND 551203", "credit")], [])
    add("N50-occasional-rides", "Irregular ride-hailing", [
        *_lifestyle(50),
        *(raw(f"ub{i}", str(amount), date(2026, month, day), "UBER *TRIP HELP.UBER.COM")
          for i, (month, day, amount) in enumerate(
              [(4, 6, 88), (4, 21, 132), (5, 9, 64), (6, 3, 151), (6, 27, 97), (7, 14, 120),
               (8, 2, 73), (8, 23, 140), (9, 11, 85)]))], [],
        note="Rides at unpredictable intervals are not a recurring commitment.")
    add("N51-three-fuel-stations", "Fuel across several stations", [
        *_lifestyle(51, 1.1)], [])
    add("N52-friend-payments-scattered", "One-off payments to a friend", [
        *_lifestyle(52),
        raw("fr1", "200", date(2026, 4, 11), "IB PAYMENT TO THABO M"),
        raw("fr2", "350", date(2026, 6, 2), "IB PAYMENT TO THABO M"),
        raw("fr3", "120", date(2026, 8, 27), "IB PAYMENT TO THABO M")], [])
    return c


__all__ = ["build_extra_noisy_customers"]
