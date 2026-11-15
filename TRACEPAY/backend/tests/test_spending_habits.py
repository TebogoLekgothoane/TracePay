"""Where the money goes: level and frequency findings, and the rules that keep them honest.

Every statement here is invented. The shapes copy what real statements print: a card
reference glued to a merchant, a system debit worded like a code, a running balance.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from categorisation.models import CategorisationResult
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.spending_habits import (
    balance_findings,
    frequent_small_purchases,
    spending_habits,
    unexplained_small_debits,
)
from leak_intelligence.statement_review import build_statement_review


def _tx(
    day: date,
    description: str,
    amount: str,
    *,
    klass: str = "spending",
    category: str | None = None,
    balance: str | None = None,
    index: int = 0,
) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=f"{day.isoformat()}-{index}-{abs(hash(description)) % 10_000}",
        user_id="user",
        amount=Decimal(amount),
        categorisation=CategorisationResult(
            category_name=category,
            category_confidence=0.9 if category else 0.0,
            transaction_class=klass,
            classification_confidence=0.9,
            classification_reason=None,
            merchant_name=None,
            rule=None,
        ),
        description=description,
        merchant_name=None,
        transaction_date=day,
        transaction_time=None,
        transaction_type="debit" if Decimal(amount) > 0 else "credit",
        is_duplicate=False,
        statement_id="s",
        balance=Decimal(balance) if balance is not None else None,
        account_id="a",
        bank_key="examplebank",
        account_last4="0000",
        currency="ZAR",
        reference=None,
        value_date=None,
        booking_date=None,
        date_confidence="high",
        source_row=index,
        dedupe_status="unique",
        transfer_status="none",
        transfer_pair_id=None,
        transfer_fee_for=None,
        reversal_of=None,
    )


START = date(2025, 5, 1)


def _daily(
    description: str,
    amount: str,
    days: int,
    *,
    step: int = 1,
    klass: str = "spending",
    index_offset: int = 0,
    **kw,
):
    return [
        _tx(
            START + timedelta(days=offset * step),
            description,
            amount,
            klass=klass,
            index=offset + index_offset,
            **kw,
        )
        for offset in range(days)
    ]


# ------------------------------------------------------------------ habits


def test_steady_ride_habit_is_reported_with_its_level_and_same_day_pairs() -> None:
    rides = _daily("DLO*BOLT.EU/O/517992001175", "30.00", 20, step=3)
    rides.append(_tx(START, "DLO*BOLT.EU/O/517992001175", "30.00", index=99))
    found = spending_habits(rides, 2)
    assert [f.title for f in found] == ["Bolt and Uber rides"]
    line = found[0].line
    assert "21 rides" in line and "R630" in line and "about R315 a month" in line
    assert "Same-day identical charges: R30 x2 on 01 May" in line
    assert found[0].group == "commitment"


def test_a_few_rides_are_not_a_habit() -> None:
    assert spending_habits(_daily("Uber 5179920011753277", "40.00", 4), 2) == []


def test_a_few_large_meals_are_reported_when_they_dominate_spending() -> None:
    meals = [
        _tx(date(2026, 5, 1), "The Windmill Un", "350.00", category="Fast Food", index=1),
        _tx(date(2026, 5, 8), "Jules On Jarvis", "330.00", category="Fast Food", index=2),
        _tx(date(2026, 5, 15), "Wimpy Cambridge", "125.00", category="Fast Food", index=3),
        _tx(date(2026, 5, 20), "Grocer", "100.00", category="Groceries", index=4),
    ]
    found = spending_habits(meals, 1)
    eating = next(item for item in found if item.title == "Takeaways and restaurants")
    assert "3 purchases, R805" in eating.line


def test_trading_payments_and_airtime_advances_are_separate_findings() -> None:
    rows = []
    for index, day in enumerate((date(2026, 5, 22), date(2026, 6, 23), date(2026, 7, 3))):
        rows.append(
            _tx(day, "Capitec Pay Payment: Deriv (79249833)", "165.00", klass="person_to_person", index=index)
        )
        rows.append(
            _tx(
                day,
                "Fee: Capitec Pay Payment: Deriv (79249833)",
                "1.00",
                klass="bank_fee",
                category="Bank Fees",
                index=index + 10,
            )
        )
    rows.extend(
        [
            _tx(date(2026, 9, 11), "Banking App Airtime Advance Fee (ABC123)", "1.00", index=20),
            _tx(date(2026, 9, 11), "Banking App Airtime Advance Fee (DEF456)", "1.00", index=21),
            _tx(date(2026, 9, 15), "Banking App Airtime Advance Payment (ABC123)", "10.00", index=22),
            _tx(date(2026, 9, 15), "Banking App Airtime Advance Payment (DEF456)", "10.00", index=23),
            _tx(
                date(2026, 5, 10),
                "Banking App Prepaid Purchase: MTN",
                "20.00",
                category="Airtime & Data",
                index=30,
            ),
        ]
    )
    review = build_statement_review(rows)
    trading = next(item for item in review.findings if item.key == "trading:deriv")
    advance = next(item for item in review.findings if item.key == "airtime_advance")
    airtime = next(item for item in review.findings if item.key == "airtime")
    assert "3 payments, R495" in trading.shows
    assert "Payment fees on them came to R3" in trading.shows
    assert "No payment from Deriv came back" in trading.shows
    assert "R1 charged on each R10" in advance.shows
    assert "Advance" not in airtime.line
    assert "R20" in airtime.line


def test_one_weekend_of_meals_is_not_a_habit() -> None:
    meals = [
        _tx(date(2026, 5, 1), "The Windmill Un", "350.00", category="Fast Food", index=1),
        _tx(date(2026, 5, 1), "Jules On Jarvis", "330.00", category="Fast Food", index=2),
        _tx(date(2026, 5, 1), "Wimpy Cambridge", "125.00", category="Fast Food", index=3),
        _tx(date(2026, 5, 1), "Grocer", "100.00", category="Groceries", index=4),
    ]
    found = spending_habits(meals, 1)
    assert all(item.title != "Takeaways and restaurants" for item in found)


def test_an_unlisted_broker_is_found_and_a_person_or_shop_is_not() -> None:
    rows = []
    for index, day in enumerate((date(2026, 5, 2), date(2026, 6, 2), date(2026, 7, 2))):
        rows.append(
            _tx(day, "Capitec Pay Payment: Zenfx (88342111)", "200.00", klass="person_to_person", index=index)
        )
        rows.append(
            _tx(day, "Capitec Pay Payment: Mamas (88342111)", "80.00", klass="person_to_person", index=index + 10)
        )
        rows.append(
            _tx(day, "Immediate Payment: Neo Capitec", "400.00", klass="person_to_person", index=index + 20)
        )
        rows.append(
            _tx(day, "Capitec Pay Payment: Equifax (88342111)", "50.00", klass="person_to_person", index=index + 30)
        )
    rows.extend(
        [
            _tx(date(2026, 8, 1), "Xtratime Fee", "2.00", index=40),
            _tx(date(2026, 8, 1), "Xtratime Fee", "2.00", index=41),
            _tx(date(2026, 8, 4), "Xtratime Repayment", "15.00", index=42),
            _tx(date(2026, 8, 4), "Xtratime Repayment", "15.00", index=43),
        ]
    )
    review = build_statement_review(rows)
    keys = {item.key for item in review.findings}
    assert "trading:zenfx" in keys
    assert "trading:mamas" not in keys
    assert not any(key.startswith("trading:neo") for key in keys)
    assert "trading:equifax" not in keys
    trading = next(item for item in review.findings if item.key == "trading:zenfx")
    assert "3 payments, R600" in trading.shows
    advance = next(item for item in review.findings if item.key == "airtime_advance")
    assert "R2 charged on each R15" in advance.shows


def test_eating_out_is_read_from_words_and_categories_but_never_groceries() -> None:
    rows = [
        *_daily("TROPICAL FOOD 517992001175", "30.00", 8),
        *_daily("KFC BAOBAB HEM517992001175", "75.00", 4, step=7),
        *_daily("Corner Place", "60.00", 4, step=5, category="Restaurants"),
        *_daily("SuperSpar Sout517992001175", "200.00", 6, step=4, category="Groceries"),
    ]
    found = spending_habits(rows, 1)
    eating = next(f for f in found if f.title == "Takeaways and restaurants")
    assert eating.rows_total == 16
    assert "Superspar" not in eating.line and "SuperSpar" not in eating.line


def test_cash_withdrawals_carry_their_atm_fees() -> None:
    rows = [
        *_daily("ATM CASH 5179920011753277", "100.00", 8, step=3, klass="unknown"),
        _tx(START + timedelta(days=28), "ATM/SSD FEE 01/05 - 28/05", "36.00", klass="bank_fee", index=50),
    ]
    found = spending_habits(rows, 1)
    cash = next(f for f in found if f.title == "Cash withdrawals")
    assert "8 withdrawals, R800" in cash.line
    assert "ATM fees in the period came to R36" in cash.line
    assert "8 of the 8 were R200 or less" in cash.line


def test_delivery_habit_defers_to_the_existing_delivery_finding() -> None:
    orders = _daily("MR D FOOD 5179920011753277", "200.00", 8, step=3)
    assert [f.title for f in spending_habits(orders, 1)] == ["Food delivery"]
    assert spending_habits(orders, 1, delivery_raised=True) == []


# ------------------------------------------------------------------ frequent small purchases


#: Ordinary purchases that set the statement's typical purchase (median R120 here).
CONTEXT = [*_daily("Grocer", "120.00", 15, step=2, index_offset=500)]


def test_an_unrecognised_shop_visited_daily_is_a_frequent_purchase_finding() -> None:
    rows = [*CONTEXT, *_daily("THEORCHIDSTUCK517992001175", "20.00", 14, klass="unknown")]
    found = frequent_small_purchases(rows, 1)
    assert len(found) == 1
    assert found[0].title == "Frequent small purchases at Theorchidstuck"
    assert "14 purchases, R280" in found[0].line
    assert "on 14 of its 31 days" in found[0].line
    assert "517992001175" not in found[0].title


def test_big_or_occasional_purchases_are_not_frequent_small_ones() -> None:
    # Six visits in a month is not one day in three; R150 is above the typical purchase.
    assert frequent_small_purchases([*CONTEXT, *_daily("Corner Shop", "20.00", 6)], 1) == []
    assert frequent_small_purchases([*CONTEXT, *_daily("Big Shop", "150.00", 14)], 1) == []


def test_airtime_rides_and_cash_have_their_own_lines_so_are_left_out() -> None:
    rows = [
        *_daily("MTN Airtime Top-up 0736438", "10.00", 14),
        *_daily("Bolt 5179920011753277", "25.00", 14),
        *_daily("ATM CASH 5179920011753277", "50.00", 14, klass="unknown"),
    ]
    assert frequent_small_purchases(rows, 1) == []


# ------------------------------------------------------------------ unexplained debits


def test_a_small_coded_debit_repeating_within_a_month_is_raised_as_a_question() -> None:
    rows = [
        *CONTEXT,
        *[
            _tx(START + timedelta(days=d), f"MDS M/C IN 06{d:02d} 1520 INS F", "10.00", klass="unknown", index=d)
            for d in (8, 10, 12, 16, 29)
        ],
    ]
    found = unexplained_small_debits(rows, 1)
    assert len(found) == 1
    assert found[0].group == "review"
    assert "5 debits of R10" in found[0].shows and "R50 in all" in found[0].shows


def test_card_purchases_and_varying_amounts_are_not_unexplained_debits() -> None:
    card = _daily("SOME SHOP 517992001175", "10.00", 5, klass="unknown")
    varying = [
        _tx(START + timedelta(days=d), "ODD CODE X", amount, klass="unknown", index=d)
        for d, amount in enumerate(("10.00", "22.00", "35.00", "41.00", "57.00"))
    ]
    assert unexplained_small_debits([*CONTEXT, *card], 1) == []
    assert unexplained_small_debits([*CONTEXT, *varying], 1) == []


def test_three_debits_spread_over_four_months_are_not_a_cluster() -> None:
    rows = [_tx(START + timedelta(days=d), "ODD CODE Y", "10.00", klass="unknown", index=d) for d in (0, 45, 100)]
    assert unexplained_small_debits([*CONTEXT, *rows], 4) == []


def test_one_large_purchase_does_not_hide_a_habit() -> None:
    # R240 of rides and R600 of groceries, plus one R19,499 laptop: the laptop is a one-off,
    # so the rides are still 29% of everyday spending.
    rows = [
        *_daily("Bolt 5179920011753277", "30.00", 8, step=3),
        *_daily("Grocer", "100.00", 6, step=5, index_offset=500),
        _tx(START + timedelta(days=20), "Istore Example", "19499.00", index=900),
    ]
    found = spending_habits(rows, 1)
    assert [f.title for f in found] == ["Bolt and Uber rides"]
    assert "29% of everyday spending" in found[0].line


def test_a_habit_is_judged_by_its_share_of_spending_not_a_rand_figure() -> None:
    # R240 of rides against R60 of other spending is most of what was spent: a habit.
    small_budget = [*_daily("Bolt 5179920011753277", "30.00", 8, step=3), *_daily("Grocer", "10.00", 6, step=5, index_offset=500)]
    assert [f.title for f in spending_habits(small_budget, 1)] == ["Bolt and Uber rides"]
    # The same rides against R30,000 of other spending are under 3%: not raised.
    big_budget = [*_daily("Bolt 5179920011753277", "30.00", 8, step=3), *_daily("Grocer", "5000.00", 6, step=5, index_offset=500)]
    assert spending_habits(big_budget, 1) == []


# ------------------------------------------------------------------ balance


def test_an_overdrawn_day_is_raised_with_the_charges_that_followed() -> None:
    rows = [
        _tx(START, "Shop", "10.00", balance="3.09", index=1),
        _tx(START + timedelta(days=1), "Fee thing", "10.00", klass="unknown", balance="-6.91", index=2),
        _tx(START + timedelta(days=2), "INTEREST", "0.01", klass="bank_fee", balance="-6.92", index=3),
        _tx(START + timedelta(days=3), "Deposit", "-200.00", klass="income", balance="193.08", index=4),
    ]
    found = balance_findings(rows)
    assert found is not None
    assert "Overdrawn on 02 May and 03 May (lowest -R6.92 on 03 May)." in found.shows
    assert "Bank charges in the two days after: R0.01" in found.shows


def test_a_single_low_row_before_pay_day_is_not_a_finding() -> None:
    rows = [_tx(START, "Shop", "10.00", balance="12.00", index=1)]
    assert balance_findings(rows) is None
    assert balance_findings(_daily("Shop", "10.00", 3)) is None  # no printed balances


def test_card_purchases_without_a_printed_card_number_are_not_unexplained_debits() -> None:
    rows = [
        _tx(date(2026, 7, day), "POS Purchase S2S*Examplebar", "30.00", klass="unknown", index=day)
        for day in (2, 9, 16)
    ]
    assert unexplained_small_debits(rows, 1) == []


def test_an_unreadable_description_is_not_a_frequent_shop() -> None:
    rows = [
        _tx(date(2026, 7, day), "No description printed", "3.00", klass="unknown", index=day)
        for day in range(1, 28)
    ]
    assert frequent_small_purchases(rows, 1) == []


def test_overdraft_interest_of_a_few_cents_is_not_a_finding() -> None:
    rows = [
        *_daily("Shop", "10.00", 3),
        _tx(START + timedelta(days=30), "INTEREST 01/05 - 30/05", "0.01", klass="bank_fee", index=40),
    ]
    review = build_statement_review(rows)
    assert not [f for f in review.findings if f.key == "overdraft_interest"]


# ------------------------------------------------------------------ cross-border fee


def test_a_small_cross_border_fee_on_a_subscriptions_days_is_that_subscriptions_fee() -> None:
    rows = []
    for month in (5, 6, 7):
        day = date(2025, month, 9)
        rows.append(_tx(day, "SpotifyZA 5179920011753277", "64.99", index=month))
        rows.append(_tx(day, "CROSS BORDER T517992001175", "1.29", klass="unknown", index=month + 10))
    review = build_statement_review(rows)
    fee = next(f for f in review.findings if f.key.startswith("unknown_recurring:"))
    # Named as the statement spells the payee ("Spotifyza" here, "Spotify" once recognised).
    assert fee.title.startswith("Foreign-billing fee on Spotify")
    assert "R1.29 each time Spotify" in fee.shows and "is charged" in fee.shows
