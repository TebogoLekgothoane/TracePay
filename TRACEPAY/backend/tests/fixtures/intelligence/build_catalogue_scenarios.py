"""Generate catalogue expansion scenarios. Run from backend: python tests/fixtures/intelligence/build_catalogue_scenarios.py"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCENARIOS = ROOT / "scenarios"
USER = "synthetic-intelligence-user"


def tx(
    tx_id: str,
    when: date,
    amount: str,
    *,
    description: str,
    merchant: str | None = None,
    category: str = "Groceries",
    transaction_class: str = "spending",
    transaction_type: str = "debit",
    confidence: float = 0.95,
) -> dict:
    return {
        "id": tx_id,
        "user_id": USER,
        "date": when.isoformat(),
        "description": description,
        "amount": amount,
        "type": transaction_type,
        "is_duplicate": False,
        "merchant_name": merchant,
        "category_confidence": confidence,
        "category_rule": None,
        "transaction_class": transaction_class,
        "classification_confidence": confidence,
        "classification_reason": "synthetic-intelligence-dataset",
        "categories": {"name": category},
    }


def write_scenario(filename: str, rows: list[dict]) -> str:
    path = SCENARIOS / filename
    path.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    return f"scenarios/{filename}"


def month_starts(year: int, month: int, count: int) -> list[date]:
    current = date(year, month, 1)
    out = []
    for _ in range(count):
        out.append(current)
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)
    return out


def fee_rows(prefix: str, amounts_per_month: list[tuple[int, str]], desc: str) -> list[dict]:
    rows: list[dict] = []
    months = month_starts(2026, 7, len(amounts_per_month))
    for month_index, (count, amount) in enumerate(amounts_per_month):
        for index in range(count):
            day = min(2 + index, 28)
            rows.append(
                tx(
                    f"{prefix}-{month_index}-{index}",
                    date(months[month_index].year, months[month_index].month, day),
                    amount,
                    description=desc,
                    merchant=None,
                    category="Bank Fees",
                    transaction_class="bank_fee",
                )
            )
    return rows


def grocery_pad(months: list[date], amount: str = "900.00") -> list[dict]:
    rows = []
    for index, month in enumerate(months):
        rows.append(
            tx(
                f"pad-grocery-{index}",
                date(month.year, month.month, 3),
                amount,
                description="POS PURCHASE CHECKERS SANDTON",
                merchant="CHECKERS",
                category="Groceries",
            )
        )
    return rows


def build_all() -> list[dict]:
    files: dict[str, list[dict]] = {}

    files["FI-003-immediate-payment-fee-overuse.json"] = fee_rows(
        "fi003-pos",
        [(4, "8.00"), (8, "8.00"), (12, "8.00")],
        "IMMEDIATE PAYMENT FEE",
    )
    files["FI-003-immediate-payment-fee-rare.json"] = fee_rows(
        "fi003-neg",
        [(1, "8.00")],
        "IMMEDIATE PAYMENT FEE",
    )

    months = month_starts(2026, 7, 3)
    fi004_pos: list[dict] = []
    for index, month in enumerate(months):
        fi004_pos.append(
            tx(
                f"fi004-cash-{index}",
                date(month.year, month.month, 5),
                str(200 + index * 100),
                description="ATM CASH WITHDRAWAL FNB",
                merchant=None,
                category="Cash Withdrawal",
            )
        )
        fi004_pos.append(
            tx(
                f"fi004-atm-fee-{index}",
                date(month.year, month.month, 5),
                "20.00",
                description="ATM WITHDRAWAL FEE",
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
            )
        )
    files["FI-004-atm-withdrawal-fee-stacking.json"] = fi004_pos
    files["FI-004-atm-withdrawal-fee-minimal.json"] = [
        tx(
            "fi004-neg-cash",
            date(2026, 7, 5),
            "200.00",
            description="ATM CASH WITHDRAWAL FNB",
            merchant=None,
            category="Cash Withdrawal",
        )
    ]

    files["FI-005-balance-enquiry-charges.json"] = fee_rows(
        "fi005-pos",
        [(2, "5.00"), (2, "5.00"), (3, "5.00")],
        "BALANCE ENQUIRY FEE",
    )
    files["FI-005-balance-enquiry-single.json"] = fee_rows(
        "fi005-neg",
        [(1, "5.00")],
        "BALANCE ENQUIRY FEE",
    )

    files["FI-013-sms-banking-charges.json"] = fee_rows(
        "fi013-pos",
        [(2, "3.00"), (4, "3.00"), (6, "3.00")],
        "SMS NOTIFICATION FEE",
    )
    files["FI-013-no-sms-fees.json"] = grocery_pad(months)

    showmax_months = month_starts(2026, 7, 4)
    files["FI-016-forgotten-showmax-subscription.json"] = [
        tx(
            f"fi016-showmax-{index}",
            month,
            "99.00",
            description="DEBIT ORDER SHOWMAX SUBSCRIPTION",
            merchant="SHOWMAX",
            category="Subscriptions",
        )
        for index, month in enumerate(showmax_months)
    ]
    files["FI-016-single-subscription-payment.json"] = [
        tx(
            "fi016-neg-once",
            date(2026, 7, 1),
            "99.00",
            description="DEBIT ORDER SHOWMAX SUBSCRIPTION",
            merchant="SHOWMAX",
            category="Subscriptions",
        ),
        *grocery_pad(months),
    ]

    creep_months = month_starts(2026, 7, 4)
    creep_amounts = ["199.00", "249.00", "299.00", "349.00"]
    files["FI-018-subscription-price-creep.json"] = [
        tx(
            f"fi018-netflix-{index}",
            month,
            amount,
            description="DEBIT ORDER NETFLIX.COM",
            merchant="NETFLIX",
            category="Subscriptions",
        )
        for index, (month, amount) in enumerate(zip(creep_months, creep_amounts, strict=True))
    ]
    flat_months = month_starts(2026, 7, 2)
    files["FI-018-flat-subscription.json"] = [
        tx(
            f"fi018-flat-{index}",
            month,
            "199.00",
            description="DEBIT ORDER NETFLIX.COM",
            merchant="NETFLIX",
            category="Subscriptions",
        )
        for index, month in enumerate(flat_months)
    ]

    gym_months = month_starts(2026, 7, 4)
    files["FI-023-debit-order-zombie-gym.json"] = [
        tx(
            f"fi023-gym-{index}",
            month,
            "450.00",
            description="DEBIT ORDER VIRGIN ACTIVE",
            merchant="VIRGIN ACTIVE",
            category="Other",
        )
        for index, month in enumerate(gym_months)
    ]
    files["FI-023-debit-order-ended.json"] = [
        tx(
            f"fi023-gym-{index}",
            month,
            "450.00",
            description="DEBIT ORDER VIRGIN ACTIVE",
            merchant="VIRGIN ACTIVE",
            category="Other",
        )
        for index, month in enumerate(gym_months[:2])
    ] + grocery_pad(gym_months[2:])

    municipal_months = month_starts(2026, 7, 4)
    municipal_amounts = ["800.00", "850.00", "920.00", "990.00"]
    files["FI-025-increased-debit-order-amounts.json"] = [
        tx(
            f"fi025-muni-{index}",
            month,
            amount,
            description="DEBIT ORDER CITY OF JHB",
            merchant="CITY OF JHB",
            category="Other",
        )
        for index, (month, amount) in enumerate(zip(municipal_months, municipal_amounts, strict=True))
    ]
    files["FI-025-flat-debit-order.json"] = [
        tx(
            f"fi025-flat-{index}",
            month,
            "800.00",
            description="DEBIT ORDER CITY OF JHB",
            merchant="CITY OF JHB",
            category="Other",
        )
        for index, month in enumerate(municipal_months)
    ]

    spar_months = month_starts(2026, 7, 3)
    spar_totals = [("120.00", 2), ("220.00", 3), ("420.00", 5)]
    fi030_pos: list[dict] = []
    for month_index, (total_hint, count) in enumerate(spar_totals):
        month = spar_months[month_index]
        per = str(round(float(total_hint) / count, 2))
        for index in range(count):
            fi030_pos.append(
                tx(
                    f"fi030-spar-{month_index}-{index}",
                    date(month.year, month.month, 4 + index),
                    per,
                    description="POS PURCHASE SPAR EXPRESS SANDTON",
                    merchant="SPAR EXPRESS",
                    category="Groceries",
                )
            )
    files["FI-030-convenience-store-leakage.json"] = fi030_pos
    files["FI-030-flat-convenience-spend.json"] = [
        tx(
            f"fi030-flat-{index}",
            date(month.year, month.month, 4),
            "150.00",
            description="POS PURCHASE SPAR EXPRESS SANDTON",
            merchant="SPAR EXPRESS",
            category="Groceries",
        )
        for index, month in enumerate(spar_months)
    ]

    impulse_months = month_starts(2026, 7, 3)
    fi031_pos: list[dict] = []
    for month_index, month in enumerate(impulse_months):
        count = 2 if month_index < 2 else 8
        amount = "80.00" if month_index < 2 else "120.00"
        for index in range(count):
            fi031_pos.append(
                tx(
                    f"fi031-shop-{month_index}-{index}",
                    date(month.year, month.month, 6 + index),
                    amount,
                    description="POS PURCHASE PICK N PAY SANDTON",
                    merchant="PICK N PAY",
                    category="Shopping",
                )
            )
    files["FI-031-impulse-spending-pattern.json"] = fi031_pos
    files["FI-031-stable-shopping.json"] = [
        tx(
            f"fi031-stable-{index}",
            date(month.year, month.month, 6),
            "300.00",
            description="POS PURCHASE PICK N PAY SANDTON",
            merchant="PICK N PAY",
            category="Shopping",
        )
        for index, month in enumerate(impulse_months)
    ]

    income_dates = [date(2026, 7, 25), date(2026, 8, 25), date(2026, 9, 25)]
    fi033_pos: list[dict] = []
    for index, income_day in enumerate(income_dates):
        fi033_pos.append(
            tx(
                f"fi033-income-{index}",
                income_day,
                "15000.00",
                description="SALARY ACME PAYROLL",
                merchant="ACME PAYROLL",
                category="Salary",
                transaction_class="income",
                transaction_type="credit",
            )
        )
        for offset in range(3):
            fi033_pos.append(
                tx(
                    f"fi033-spend-{index}-{offset}",
                    income_day + timedelta(days=offset),
                    "450.00",
                    description="POS PURCHASE CHECKERS SANDTON",
                    merchant="CHECKERS",
                    category="Groceries",
                )
            )
        fi033_pos.append(
            tx(
                f"fi033-quiet-{index}",
                date(income_day.year, income_day.month, 10),
                "120.00",
                description="POS PURCHASE SPAR EXPRESS",
                merchant="SPAR EXPRESS",
                category="Groceries",
            )
        )
    files["FI-033-payday-spending-pattern.json"] = fi033_pos
    fi033_neg: list[dict] = []
    for index, income_day in enumerate(income_dates):
        fi033_neg.append(
            tx(
                f"fi033-neg-income-{index}",
                income_day,
                "15000.00",
                description="SALARY ACME PAYROLL",
                merchant="ACME PAYROLL",
                category="Salary",
                transaction_class="income",
                transaction_type="credit",
            )
        )
        for day in (8, 15, 22):
            fi033_neg.append(
                tx(
                    f"fi033-neg-spend-{index}-{day}",
                    date(income_day.year, income_day.month, day),
                    "250.00",
                    description="POS PURCHASE CHECKERS SANDTON",
                    merchant="CHECKERS",
                    category="Groceries",
                )
            )
    files["FI-033-even-spending-across-month.json"] = fi033_neg

    files["FI-034-cash-dependency.json"] = [
        tx("fi034-cash-1", date(2026, 7, 1), "100.00", description="ATM CASH WITHDRAWAL", merchant=None, category="Cash Withdrawal"),
        tx("fi034-cash-2", date(2026, 8, 1), "200.00", description="ATM CASH WITHDRAWAL", merchant=None, category="Cash Withdrawal"),
        tx("fi034-cash-3", date(2026, 9, 30), "300.00", description="ATM CASH WITHDRAWAL", merchant=None, category="Cash Withdrawal"),
        tx("fi034-atm-1", date(2026, 7, 2), "20.00", description="ATM WITHDRAWAL FEE", merchant=None, category="Bank Fees", transaction_class="bank_fee"),
        tx("fi034-atm-2", date(2026, 8, 2), "20.00", description="ATM WITHDRAWAL FEE", merchant=None, category="Bank Fees", transaction_class="bank_fee"),
        tx("fi034-atm-3", date(2026, 9, 29), "20.00", description="ATM WITHDRAWAL FEE", merchant=None, category="Bank Fees", transaction_class="bank_fee"),
    ]
    files["FI-034-no-cash-withdrawals.json"] = grocery_pad(months)

    airtime_rows: list[dict] = []
    airtime_pattern = [
        (date(2026, 7, 1), "40.00"),
        (date(2026, 7, 2), "40.00"),
        (date(2026, 8, 1), "40.00"),
        (date(2026, 8, 2), "40.00"),
        (date(2026, 9, 28), "100.00"),
        (date(2026, 9, 29), "100.00"),
        (date(2026, 9, 30), "100.00"),
    ]
    for index, (when, amount) in enumerate(airtime_pattern):
        airtime_rows.append(
            tx(
                f"fi035-air-{index}",
                when,
                amount,
                description="PREPAID AIRTIME MTN",
                merchant="MTN",
                category="Airtime & Data",
            )
        )
    files["FI-035-airtime-inefficiency.json"] = airtime_rows
    files["FI-035-minimal-airtime.json"] = [
        tx("fi035-neg-1", date(2026, 7, 1), "30.00", description="PREPAID AIRTIME MTN", merchant="MTN", category="Airtime & Data"),
        tx("fi035-neg-2", date(2026, 8, 1), "30.00", description="PREPAID AIRTIME MTN", merchant="MTN", category="Airtime & Data"),
    ]

    data_rows: list[dict] = []
    data_amounts = [("2026-07-05", "79.00"), ("2026-08-05", "99.00"), ("2026-09-05", "149.00"), ("2026-09-20", "149.00"), ("2026-09-30", "149.00")]
    for index, (when_s, amount) in enumerate(data_amounts):
        y, m, d = map(int, when_s.split("-"))
        data_rows.append(
            tx(
                f"fi036-data-{index}",
                date(y, m, d),
                amount,
                description="VODACOM DATA BUNDLE",
                merchant="VODACOM",
                category="Airtime & Data",
            )
        )
    files["FI-036-mobile-data-inefficiency.json"] = data_rows + grocery_pad(months)
    files["FI-036-flat-mobile-data.json"] = [
        tx("fi036-flat-1", date(2026, 7, 5), "79.00", description="VODACOM DATA BUNDLE", merchant="VODACOM", category="Airtime & Data"),
        tx("fi036-flat-2", date(2026, 8, 5), "79.00", description="VODACOM DATA BUNDLE", merchant="VODACOM", category="Airtime & Data"),
        tx("fi036-flat-3", date(2026, 9, 5), "79.00", description="VODACOM DATA BUNDLE", merchant="VODACOM", category="Airtime & Data"),
    ]

    transport_months = month_starts(2026, 7, 3)
    fi037_pos: list[dict] = []
    fi037_pos.extend(grocery_pad(transport_months))
    ride_amounts = [("100.00", date(2026, 7, 1)), ("100.00", date(2026, 8, 1)), ("200.00", date(2026, 9, 29)), ("200.00", date(2026, 9, 30))]
    for index, (amount, when) in enumerate(ride_amounts):
        fi037_pos.append(
            tx(
                f"fi037-uber-{index}",
                when,
                amount,
                description="UBER TRIP JOHANNESBURG",
                merchant="UBER",
                category="Ride Hailing",
            )
        )
    files["FI-037-ride-hailing-dependency.json"] = fi037_pos
    files["FI-037-single-ride-hail.json"] = grocery_pad(transport_months) + [
        tx("fi037-neg-uber", date(2026, 9, 15), "85.00", description="UBER TRIP JOHANNESBURG", merchant="UBER", category="Ride Hailing")
    ]

    delivery_months = month_starts(2026, 7, 3)
    fi038_pos: list[dict] = []
    fi038_pos.extend(grocery_pad(delivery_months))
    delivery_amounts = [("120.00", 2), ("180.00", 2), ("320.00", 3)]
    for month_index, month in enumerate(delivery_months):
        amount, count = delivery_amounts[month_index]
        last_month = month_index == len(delivery_months) - 1
        for index in range(count):
            day = 30 if last_month and index == count - 1 else 8 + index
            fi038_pos.append(
                tx(
                    f"fi038-ubereats-{month_index}-{index}",
                    date(month.year, month.month, day),
                    amount,
                    description="UBER EATS ORDER SANDTON",
                    merchant="UBER EATS",
                    category="Restaurants",
                )
            )
    files["FI-038-food-delivery-dependency.json"] = fi038_pos
    files["FI-038-single-food-delivery.json"] = grocery_pad(delivery_months) + [
        tx(
            "fi038-neg-once",
            date(2026, 9, 10),
            "180.00",
            description="UBER EATS ORDER SANDTON",
            merchant="UBER EATS",
            category="Restaurants",
        )
    ]

    steers_months = month_starts(2026, 7, 3)
    steers_amounts = ["120.00", "160.00", "220.00"]
    files["FI-039-merchant-price-increase.json"] = [
        tx(
            f"fi039-steers-{index}",
            date(month.year, month.month, 12),
            amount,
            description="POS PURCHASE STEERS SANDTON",
            merchant="STEERS",
            category="Restaurants",
        )
        for index, (month, amount) in enumerate(zip(steers_months, steers_amounts, strict=True))
    ]
    files["FI-039-flat-merchant-prices.json"] = [
        tx(
            f"fi039-flat-{index}",
            date(month.year, month.month, 12),
            "120.00",
            description="POS PURCHASE STEERS SANDTON",
            merchant="STEERS",
            category="Restaurants",
        )
        for index, month in enumerate(steers_months)
    ]

    positive_card_fees = fee_rows(
        "fi042-pos",
        [(1, "25.00"), (1, "35.00"), (1, "45.00")],
        "MONTHLY CARD FEE",
    )
    positive_card_fees[-1]["date"] = "2026-09-30"
    files["FI-042-recurring-card-fee-change.json"] = positive_card_fees
    flat_card_fees = fee_rows(
        "fi042-neg",
        [(1, "25.00"), (1, "25.00"), (1, "25.00")],
        "MONTHLY CARD FEE",
    )
    flat_card_fees[-1]["date"] = "2026-09-30"
    files["FI-042-flat-card-fee.json"] = flat_card_fees

    files["FI-054-duplicate-charges-same-day.json"] = [
        tx("fi054-a", date(2026, 7, 14), "250.00", description="POS PURCHASE CNA SANDTON", merchant="CNA", category="Shopping"),
        tx("fi054-b", date(2026, 7, 14), "250.00", description="POS PURCHASE CNA SANDTON", merchant="CNA", category="Shopping"),
        tx("fi054-c", date(2026, 9, 20), "180.00", description="POS PURCHASE CHECKERS", merchant="CHECKERS", category="Groceries"),
    ]
    files["FI-054-no-duplicate-charge.json"] = [
        tx("fi054-neg-a", date(2026, 7, 14), "250.00", description="POS PURCHASE CNA SANDTON", merchant="CNA", category="Shopping"),
        tx("fi054-neg-b", date(2026, 7, 15), "250.00", description="POS PURCHASE CNA SANDTON", merchant="CNA", category="Shopping"),
        tx("fi054-neg-later", date(2026, 9, 30), "180.00", description="POS PURCHASE CHECKERS", merchant="CHECKERS", category="Groceries"),
    ]

    fi003_edge = fee_rows("fi003-edge", [(3, "8.00"), (3, "8.00"), (3, "8.00")], "IMMEDIATE PAYMENT FEE")
    files["edge-immediate-payment-fees-below-materiality.json"] = fi003_edge

    fi018_edge_months = month_starts(2026, 7, 4)
    files["edge-subscription-creep-under-materiality.json"] = [
        tx(
            f"fi018-edge-{index}",
            month,
            str(199 + index * 2) + ".00",
            description="DEBIT ORDER NETFLIX.COM",
            merchant="NETFLIX",
            category="Subscriptions",
        )
        for index, month in enumerate(fi018_edge_months)
    ]

    for name, rows in files.items():
        write_scenario(name, rows)

    return list(files.keys())


def _spec(
    scenario_id: str,
    fi_id: str | None,
    name: str,
    case_kind: str,
    family: str,
    summary: str,
    transactions_file: str,
    expected: dict,
) -> dict:
    return {
        "scenario_id": scenario_id,
        "fi_id": fi_id,
        "name": name,
        "case_kind": case_kind,
        "family": family,
        "summary": summary,
        "transactions_file": transactions_file,
        "expected": expected,
        "enforce_expectation": False,
    }


def catalogue_manifest_entries() -> list[dict]:
    absent_bank = {"detected": False, "leak_type": "bank_fee_leak"}
    absent_sub = {"detected": False, "leak_type": "subscription_leak"}
    absent_recurring = {
        "detected": False,
        "leak_types": [
            "subscription_leak",
            "recurring_payment_leak",
            "unknown_recurring_payment",
        ],
    }
    return [
        _spec(
            "FI-003-immediate-payment-fee-overuse",
            "FI-003",
            "Immediate payment fee overuse",
            "positive",
            "banking_fees",
            "Repeated immediate payment fees rise across three completed months.",
            "scenarios/FI-003-immediate-payment-fee-overuse.json",
            {"detected": True, "leak_type": "bank_fee_leak"},
        ),
        _spec(
            "FI-003-immediate-payment-fee-rare",
            "FI-003",
            "Rare immediate payment fees",
            "negative",
            "banking_fees",
            "A single immediate payment fee should not trigger a banking fee leak.",
            "scenarios/FI-003-immediate-payment-fee-rare.json",
            absent_bank,
        ),
        _spec(
            "edge-immediate-payment-fees-below-materiality",
            "FI-003",
            "Immediate payment fees below materiality",
            "edge",
            "banking_fees",
            "Several small immediate payment fees stay below the fee-change materiality threshold.",
            "scenarios/edge-immediate-payment-fees-below-materiality.json",
            absent_bank,
        ),
        _spec(
            "FI-004-atm-withdrawal-fee-stacking",
            "FI-004",
            "ATM withdrawal fee stacking",
            "positive",
            "banking_fees",
            "Repeated cash withdrawals with ATM fees and cash dependency behaviour.",
            "scenarios/FI-004-atm-withdrawal-fee-stacking.json",
            {"detected": True, "leak_type": "cash_usage_leak"},
        ),
        _spec(
            "FI-004-atm-withdrawal-fee-minimal",
            "FI-004",
            "Minimal ATM activity",
            "negative",
            "banking_fees",
            "One cash withdrawal without ATM fees should not create a cash usage leak.",
            "scenarios/FI-004-atm-withdrawal-fee-minimal.json",
            {"detected": False, "leak_type": "cash_usage_leak"},
        ),
        _spec(
            "FI-005-balance-enquiry-charges",
            "FI-005",
            "Balance enquiry charges",
            "positive",
            "banking_fees",
            "Repeated balance enquiry fees accumulate across three months.",
            "scenarios/FI-005-balance-enquiry-charges.json",
            {"detected": True, "leak_type": "bank_fee_leak"},
        ),
        _spec(
            "FI-005-balance-enquiry-single",
            "FI-005",
            "Single balance enquiry",
            "negative",
            "banking_fees",
            "One balance enquiry fee should not trigger a banking fee leak.",
            "scenarios/FI-005-balance-enquiry-single.json",
            absent_bank,
        ),
        _spec(
            "FI-013-sms-banking-charges",
            "FI-013",
            "SMS banking charges",
            "positive",
            "banking_fees",
            "SMS notification fees repeat and accumulate across three months.",
            "scenarios/FI-013-sms-banking-charges.json",
            {"detected": True, "leak_type": "bank_fee_leak"},
        ),
        _spec(
            "FI-013-no-sms-fees",
            "FI-013",
            "No SMS banking fees",
            "negative",
            "banking_fees",
            "Groceries-only spend should not produce a banking fee leak.",
            "scenarios/FI-013-no-sms-fees.json",
            absent_bank,
        ),
        _spec(
            "FI-016-forgotten-showmax-subscription",
            "FI-016",
            "Forgotten Showmax subscription",
            "positive",
            "subscriptions",
            "A stable Showmax debit order repeats for four months.",
            "scenarios/FI-016-forgotten-showmax-subscription.json",
            {"detected": True, "leak_type": "subscription_leak"},
        ),
        _spec(
            "FI-016-single-subscription-payment",
            "FI-016",
            "Single subscription debit",
            "negative",
            "subscriptions",
            "One Showmax debit among normal spend should not be treated as a subscription leak.",
            "scenarios/FI-016-single-subscription-payment.json",
            absent_sub,
        ),
        _spec(
            "FI-018-subscription-price-creep",
            "FI-018",
            "Subscription price creep",
            "positive",
            "subscriptions",
            "Netflix debits rise across four monthly payments.",
            "scenarios/FI-018-subscription-price-creep.json",
            {"detected": True, "behavior_type": "price_increase_pattern"},
        ),
        _spec(
            "FI-018-flat-subscription",
            "FI-018",
            "Flat subscription amount",
            "negative",
            "subscriptions",
            "Two flat Netflix debits should not show subscription price creep.",
            "scenarios/FI-018-flat-subscription.json",
            {"detected": False, "behavior_type": "price_increase_pattern"},
        ),
        _spec(
            "edge-subscription-creep-under-materiality",
            "FI-018",
            "Subscription creep below materiality",
            "edge",
            "subscriptions",
            "Netflix increases by only R2 per month across four payments.",
            "scenarios/edge-subscription-creep-under-materiality.json",
            {"detected": False, "behavior_type": "price_increase_pattern"},
        ),
        _spec(
            "FI-023-debit-order-zombie-gym",
            "FI-023",
            "Debit order zombie gym",
            "positive",
            "debit_orders",
            "A Virgin Active debit order repeats monthly for four months.",
            "scenarios/FI-023-debit-order-zombie-gym.json",
            {"detected": True, "leak_type": "recurring_payment_leak"},
        ),
        _spec(
            "FI-023-debit-order-ended",
            "FI-023",
            "Ended debit order",
            "negative",
            "debit_orders",
            "Two gym debits should not be treated as an established recurring bill.",
            "scenarios/FI-023-debit-order-ended.json",
            absent_recurring,
        ),
        _spec(
            "FI-025-increased-debit-order-amounts",
            "FI-025",
            "Increased debit order amounts",
            "positive",
            "debit_orders",
            "City of Johannesburg debit order amounts rise across four months.",
            "scenarios/FI-025-increased-debit-order-amounts.json",
            {"detected": True, "behavior_type": "price_increase_pattern"},
        ),
        _spec(
            "FI-025-flat-debit-order",
            "FI-025",
            "Flat debit order",
            "negative",
            "debit_orders",
            "Flat municipal debits should not show a price increase pattern.",
            "scenarios/FI-025-flat-debit-order.json",
            {"detected": False, "behavior_type": "price_increase_pattern"},
        ),
        _spec(
            "FI-030-convenience-store-leakage",
            "FI-030",
            "Convenience store leakage",
            "positive",
            "behaviour",
            "Spar Express grocery-category spend rises in frequency and total.",
            "scenarios/FI-030-convenience-store-leakage.json",
            {"detected": True, "behavior_type": "category_growth"},
        ),
        _spec(
            "FI-030-flat-convenience-spend",
            "FI-030",
            "Flat convenience spend",
            "negative",
            "behaviour",
            "Flat Spar Express spend should not show convenience leakage growth.",
            "scenarios/FI-030-flat-convenience-spend.json",
            {"detected": False, "behavior_type": "category_growth"},
        ),
        {
            **_spec(
                "FI-031-impulse-spending-pattern",
                "FI-031",
                "FI-031 deferred shopping spike",
                "negative",
                "behaviour",
                (
                    "DEFERRED. A shopping/spending increase does not prove impulse "
                    "intent, and the current data model contains no reliable "
                    "impulse-intent signal. This spike must not become an impulse finding."
                ),
                "scenarios/FI-031-impulse-spending-pattern.json",
                {"detected": False, "behavior_type": "spending_increase"},
            ),
            "enforce_expectation": True,
        },
        _spec(
            "FI-031-stable-shopping",
            "FI-031",
            "Stable shopping spend",
            "negative",
            "behaviour",
            "Flat monthly shopping totals should not show an impulse spending spike.",
            "scenarios/FI-031-stable-shopping.json",
            {"detected": False, "behavior_type": "spending_increase"},
        ),
        _spec(
            "FI-033-payday-spending-pattern",
            "FI-033",
            "Payday spending pattern",
            "positive",
            "behaviour",
            "Salary credits on the 25th are followed by concentrated grocery spend.",
            "scenarios/FI-033-payday-spending-pattern.json",
            {"detected": True, "behavior_type": "payday_spending_pattern"},
        ),
        _spec(
            "FI-033-even-spending-across-month",
            "FI-033",
            "Even spending across the month",
            "negative",
            "behaviour",
            "Salary and spending spread evenly should not show payday concentration.",
            "scenarios/FI-033-even-spending-across-month.json",
            {"detected": False, "behavior_type": "payday_spending_pattern"},
        ),
        {
            **_spec(
                "FI-034-cash-dependency",
                "FI-034",
                "Cash dependency",
                "positive",
                "behaviour",
                "Repeated cash withdrawals with ATM fees form a cash dependency pattern.",
                "scenarios/FI-034-cash-dependency.json",
                {"detected": True, "leak_type": "cash_usage_leak"},
            ),
            "enforce_expectation": True,
        },
        {
            **_spec(
                "FI-034-no-cash-withdrawals",
                "FI-034",
                "No cash withdrawals",
                "negative",
                "behaviour",
                "Groceries-only spend should not produce a cash usage leak.",
                "scenarios/FI-034-no-cash-withdrawals.json",
                {"detected": False, "leak_type": "cash_usage_leak"},
            ),
            "enforce_expectation": True,
        },
        _spec(
            "FI-035-airtime-inefficiency",
            "FI-035",
            "Airtime inefficiency",
            "positive",
            "behaviour",
            "MTN airtime purchases rise in the latest month with repeated activity.",
            "scenarios/FI-035-airtime-inefficiency.json",
            {"detected": True, "leak_type": "airtime_data_leak"},
        ),
        _spec(
            "FI-035-minimal-airtime",
            "FI-035",
            "Minimal airtime purchases",
            "negative",
            "behaviour",
            "Two small airtime purchases should not trigger an airtime leak.",
            "scenarios/FI-035-minimal-airtime.json",
            {"detected": False, "leak_type": "airtime_data_leak"},
        ),
        _spec(
            "FI-036-mobile-data-inefficiency",
            "FI-036",
            "Mobile data inefficiency",
            "positive",
            "behaviour",
            "Vodacom data bundles rise across three completed months.",
            "scenarios/FI-036-mobile-data-inefficiency.json",
            {"detected": True, "leak_type": "airtime_data_leak"},
        ),
        _spec(
            "FI-036-flat-mobile-data",
            "FI-036",
            "Flat mobile data spend",
            "negative",
            "behaviour",
            "Three flat data bundles should not show mobile data inefficiency.",
            "scenarios/FI-036-flat-mobile-data.json",
            {"detected": False, "leak_type": "airtime_data_leak"},
        ),
        _spec(
            "FI-037-ride-hailing-dependency",
            "FI-037",
            "Ride-hailing dependency",
            "positive",
            "behaviour",
            "Uber ride-hailing spend rises above a grocery baseline across three months.",
            "scenarios/FI-037-ride-hailing-dependency.json",
            {"detected": True, "leak_type": "transport_spending_leak"},
        ),
        _spec(
            "FI-037-single-ride-hail",
            "FI-037",
            "Single ride-hail trip",
            "negative",
            "behaviour",
            "One Uber trip should not trigger transport dependency.",
            "scenarios/FI-037-single-ride-hail.json",
            {"detected": False, "leak_type": "transport_spending_leak"},
        ),
        _spec(
            "FI-038-food-delivery-dependency",
            "FI-038",
            "Food delivery dependency",
            "positive",
            "behaviour",
            "Uber Eats restaurant spend rises across three completed months.",
            "scenarios/FI-038-food-delivery-dependency.json",
            {"detected": True, "leak_type": "food_spending_leak"},
        ),
        _spec(
            "FI-038-single-food-delivery",
            "FI-038",
            "Single food delivery",
            "negative",
            "behaviour",
            "One Uber Eats order should not trigger a food spending leak.",
            "scenarios/FI-038-single-food-delivery.json",
            {"detected": False, "leak_type": "food_spending_leak"},
        ),
        _spec(
            "FI-039-merchant-price-increase",
            "FI-039",
            "Merchant price increase",
            "positive",
            "merchant",
            "Steers meal amounts rise across three months at the same merchant.",
            "scenarios/FI-039-merchant-price-increase.json",
            {"detected": True, "behavior_type": "price_increase_pattern"},
        ),
        _spec(
            "FI-039-flat-merchant-prices",
            "FI-039",
            "Flat merchant prices",
            "negative",
            "merchant",
            "Flat Steers amounts should not show a merchant price increase pattern.",
            "scenarios/FI-039-flat-merchant-prices.json",
            {"detected": False, "behavior_type": "price_increase_pattern"},
        ),
        _spec(
            "FI-042-recurring-card-fee-change",
            "FI-042",
            "Recurring card fee change",
            "positive",
            "banking_fees",
            "Monthly card fees rise across three completed months.",
            "scenarios/FI-042-recurring-card-fee-change.json",
            {"detected": True, "leak_type": "bank_fee_leak"},
        ),
        _spec(
            "FI-042-flat-card-fee",
            "FI-042",
            "Flat card fee",
            "negative",
            "banking_fees",
            "Flat monthly card fees should not trigger a banking fee leak.",
            "scenarios/FI-042-flat-card-fee.json",
            absent_bank,
        ),
        _spec(
            "FI-054-duplicate-charges-same-day",
            "FI-054",
            "Duplicate charges same day",
            "positive",
            "duplicate",
            "Two identical CNA purchases occur on the same day.",
            "scenarios/FI-054-duplicate-charges-same-day.json",
            {"detected": True, "leak_type": "duplicate_payment_leak"},
        ),
        _spec(
            "FI-054-no-duplicate-charge",
            "FI-054",
            "No duplicate charge",
            "negative",
            "duplicate",
            "The same CNA amount on consecutive days is not a duplicate charge.",
            "scenarios/FI-054-no-duplicate-charge.json",
            {"detected": False, "leak_type": "duplicate_payment_leak"},
        ),
    ]


def merge_manifest() -> None:
    manifest_path = ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for scenario in manifest["scenarios"]:
        scenario.setdefault("enforce_expectation", True)
        if scenario["scenario_id"] == "debit-order-dstv-subscription":
            scenario["fi_id"] = "FI-016"
        if scenario["scenario_id"] == "edge-irregular-debit-order-interval":
            scenario["fi_id"] = "FI-026"
    existing_ids = {item["scenario_id"] for item in manifest["scenarios"]}
    for entry in catalogue_manifest_entries():
        if entry["scenario_id"] in existing_ids:
            raise ValueError(f"Duplicate scenario id: {entry['scenario_id']}")
        manifest["scenarios"].append(entry)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    built = build_all()
    merge_manifest()
    print(f"Wrote {len(built)} scenario files and updated manifest under {ROOT}")

