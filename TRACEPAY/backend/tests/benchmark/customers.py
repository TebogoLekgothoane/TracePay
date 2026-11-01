"""Synthetic benchmark customers with their expected findings.

The expectations are written here, from how a careful analyst would read each
statement, before the engine is run. They are never edited to match output: a
customer the engine gets wrong stays wrong and shows up in the report.

Each customer holds only the transactions that matter for its scenario, so
every finding the engine returns is either expected or a false positive.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, time, timedelta
from decimal import Decimal

from leak_intelligence.models import FeatureTransaction
from tests.test_leak_detection import _transaction

D = Decimal


@dataclass(frozen=True)
class Expected:
    """A finding an analyst would expect. ``None`` means "any"."""

    leak_type: str
    focus: str | None = None
    subject: str | None = None  # merchant key or payee signature
    monthly_impact: Decimal | None = None
    evidence_status: str | None = None
    observed_total: Decimal | None = None


@dataclass
class Customer:
    name: str
    covers: str
    transactions: list[FeatureTransaction]
    expected: list[Expected] = field(default_factory=list)
    # Total recurring monthly potential after overlaps are removed, when the
    # scenario has overlapping findings. None when there is nothing to check.
    expected_recurring_total: Decimal | None = None
    note: str = ""


def _month(year_month: tuple[int, int], day: int) -> date:
    return date(year_month[0], year_month[1], day)


MONTHS = [(2026, m) for m in (4, 5, 6, 7, 8, 9)]


def _monthly(prefix, amounts, merchant, *, category="Subscriptions", day=5, description=None, start=4):
    return [
        _transaction(
            f"{prefix}{index}",
            str(amount),
            date(2026, start + index, day),
            merchant=merchant,
            category=category,
            description=description or merchant,
        )
        for index, amount in enumerate(amounts)
    ]


def _fee(tx_id, amount, when, description, *, confidence=0.95):
    return _transaction(
        tx_id,
        str(amount),
        when,
        merchant=None,
        category="Bank Fees",
        transaction_class="bank_fee",
        description=description,
        confidence=confidence,
    )


def build_customers() -> list[Customer]:
    customers: list[Customer] = []

    # 1. Subscription price increase.
    customers.append(
        Customer(
            "01-subscription-price-increase",
            "1 Subscription price increase",
            _monthly("n", [199, 199, 199, 249, 249, 299], "NETFLIX"),
            [
                Expected(
                    "subscription_leak",
                    "subscription_review",
                    "NETFLIX",
                    monthly_impact=D("100.00"),
                    evidence_status="likely",
                )
            ],
            expected_recurring_total=D("100.00"),
        )
    )

    # 2. Two separate insurance policies: a commitment, not a leak.
    policies = []
    for index, month in enumerate((6, 7, 8, 9)):
        for ref, amount in (("111", 450), ("222", 380)):
            policies.append(
                _transaction(
                    f"p{ref}-{index}",
                    str(amount),
                    date(2026, month, 1),
                    merchant="DISCOVERY INSURE",
                    category="Insurance",
                    description=f"DEBIT ORDER DISCOVERY INSURE POLICY {ref}",
                )
            )
    customers.append(
        Customer(
            "02-two-insurance-policies",
            "2 Two separate insurance policies",
            policies,
            [],
            expected_recurring_total=D("0"),
            note="Two policies are a combined commitment, not unnecessary spending.",
        )
    )

    # 3. Duplicate debit order: the August collection is taken twice.
    gym = _monthly("g", [450, 450, 450, 450, 450], "VIRGIN ACTIVE", category="Health", day=1,
                   description="DEBIT ORDER VIRGIN ACTIVE")
    gym.append(
        _transaction("g-dup", "450", date(2026, 7, 4), merchant="VIRGIN ACTIVE", category="Health",
                     description="DEBIT ORDER VIRGIN ACTIVE")
    )
    customers.append(
        Customer(
            "03-duplicate-debit-order",
            "3 Duplicate debit order",
            gym,
            [Expected("duplicate_debit_order_leak", "duplicate_debit_order", "VIRGIN ACTIVE",
                      monthly_impact=D("450.00"))],
        )
    )

    # 4. Free trial conversion.
    showmax = [
        _transaction("t0", "0", date(2026, 6, 5), merchant="SHOWMAX", category="Subscriptions",
                     description="SHOWMAX"),
        *_monthly("s", [99, 99, 99], "SHOWMAX", start=7),
    ]
    customers.append(
        Customer(
            "04-free-trial-conversion",
            "4 Free trial conversion",
            showmax,
            [
                Expected("subscription_leak", "trial_conversion", "SHOWMAX", monthly_impact=D("99"),
                         evidence_status="likely", observed_total=D("297")),
                Expected("subscription_leak", "subscription_review", "SHOWMAX", monthly_impact=D("99.00")),
            ],
            expected_recurring_total=D("99"),
            note="The trial finding and the subscription it became describe one cost.",
        )
    )

    # 5. Unknown recurring merchant.
    customers.append(
        Customer(
            "05-unknown-recurring-merchant",
            "5 Unknown recurring merchant",
            [
                _transaction(f"u{i}", "89", date(2026, 5 + i, 12), merchant=None, category="Other",
                             confidence=0.4, description=f"ZXQ HOLDINGS {4400 + i}")
                for i in range(5)
            ],
            [Expected("unknown_recurring_payment", "unidentified_recurring_merchant", "ZXQ HOLDINGS",
                      monthly_impact=D("89"), evidence_status="possible", observed_total=D("445"))],
        )
    )

    # 6. Legitimate identical purchases.
    customers.append(
        Customer(
            "06-legitimate-identical-purchases",
            "6 Legitimate identical purchases",
            [
                _transaction("c1", "35", date(2026, 7, 10), merchant="VIDA E CAFFE", category="Restaurants",
                             transaction_time=time(8, 0)),
                _transaction("c2", "35", date(2026, 7, 10), merchant="VIDA E CAFFE", category="Restaurants",
                             transaction_time=time(15, 30)),
                _transaction("r1", "62", date(2026, 7, 12), merchant="UBER", category="Transport",
                             transaction_time=time(7, 30)),
                _transaction("r2", "62", date(2026, 7, 12), merchant="UBER", category="Transport",
                             transaction_time=time(17, 45)),
                _transaction("w1", "120", date(2026, 7, 20), merchant="WOOLWORTHS", category="Groceries"),
                _transaction("w2", "120", date(2026, 8, 3), merchant="WOOLWORTHS", category="Groceries"),
                _transaction("w3", "120", date(2026, 8, 24), merchant="WOOLWORTHS", category="Groceries"),
            ],
            [],
        )
    )

    # 7. Duplicate statement import: the second import is flagged as a duplicate.
    original = _monthly("i", [199, 199, 199, 199], "NETFLIX", start=6)
    copies = [
        replace(item, transaction_id=f"{item.transaction_id}-copy", is_duplicate=True)
        for item in original
    ]
    customers.append(
        Customer(
            "07-duplicate-statement-import",
            "7 Duplicate statement import",
            [*original, *copies],
            [Expected("subscription_leak", "subscription_review", "NETFLIX", monthly_impact=D("199.00"))],
            note="Re-importing a statement must not change or double the findings.",
        )
    )

    # 8. Irregular interest charges.
    customers.append(
        Customer(
            "08-irregular-interest-charges",
            "8 Irregular interest charges",
            [
                _fee(f"int{i}", amount, date(2026, 6 + i, 28), "CREDIT CARD INTEREST")
                for i, amount in enumerate([180, 95, 240, 60])
            ]
            + [_transaction("z", "50", date(2026, 10, 3), merchant="CHECKERS", category="Groceries")],
            [Expected("bank_fee_leak", "interest_charges", None, observed_total=D("575"),
                      evidence_status="confirmed")],
        )
    )

    # 9. Monthly bank fees (flat, ordinary).
    customers.append(
        Customer(
            "09-monthly-bank-fees",
            "9 Monthly bank fees",
            [_fee(f"mf{i}", 69, date(2026, 4 + i, 1), "MONTHLY ACCOUNT FEE") for i in range(6)],
            [],
            note="A flat monthly account fee is ordinary banking, not a leak.",
        )
    )

    # 10. One-off bank fees.
    customers.append(
        Customer(
            "10-one-off-bank-fees",
            "10 One-off bank fees",
            [
                _fee("atm", 12, date(2026, 6, 8), "ATM WITHDRAWAL FEE"),
                _fee("card", 60, date(2026, 8, 19), "CARD REPLACEMENT FEE"),
                _transaction("g1", "300", date(2026, 9, 28), merchant="CHECKERS", category="Groceries"),
            ],
            [],
        )
    )

    # 11. Refunds and reversals.
    customers.append(
        Customer(
            "11-refunds-and-reversals",
            "11 Refunds and reversals",
            [
                _transaction("b1", "800", date(2026, 7, 3), merchant="TAKEALOT", category="Shopping"),
                _transaction("b1r", "800", date(2026, 7, 9), merchant="TAKEALOT", category="Shopping",
                             transaction_type="credit", description="REFUND TAKEALOT"),
                _transaction("w1", "186.40", date(2026, 8, 18), merchant="WOOLWORTHS", category="Groceries"),
                _transaction("w1r", "186.40", date(2026, 8, 18), merchant="WOOLWORTHS", category="Groceries",
                             transaction_type="credit", description="WOOLWORTHS REVERSAL"),
                _transaction("w2", "186.40", date(2026, 8, 18), merchant="WOOLWORTHS", category="Groceries"),
                _transaction("g1", "90", date(2026, 9, 25), merchant="CHECKERS", category="Groceries"),
            ],
            [],
        )
    )

    # 12. Own-account transfers.
    customers.append(
        Customer(
            "12-own-account-transfers",
            "12 Own-account transfers",
            [
                *[
                    _transaction(f"o{i}", "5000", date(2026, 6 + i, 4), merchant=None, category="Transfers",
                                 transaction_class="internal_transfer", description="TRANSFER TO SAVINGS")
                    for i in range(4)
                ],
                *[
                    _transaction(f"oi{i}", "5000", date(2026, 6 + i, 4), merchant=None, category="Transfers",
                                 transaction_class="internal_transfer", transaction_type="credit",
                                 description="TRANSFER FROM CURRENT")
                    for i in range(4)
                ],
            ],
            [],
        )
    )

    # 13. Multiple subscriptions.
    customers.append(
        Customer(
            "13-multiple-subscriptions",
            "13 Multiple subscriptions",
            [
                *_monthly("n", [199] * 6, "NETFLIX", day=5),
                *_monthly("sp", [80] * 6, "SPOTIFY", day=9),
                *_monthly("dp", [150] * 6, "DROPBOX", day=14),
            ],
            [
                Expected("subscription_leak", "subscription_review", "NETFLIX", monthly_impact=D("199.00")),
                Expected("subscription_leak", "subscription_review", "SPOTIFY", monthly_impact=D("80.00")),
                Expected("subscription_leak", "subscription_review", "DROPBOX", monthly_impact=D("150.00")),
            ],
            expected_recurring_total=D("429.00"),
        )
    )

    # 14. Irregular recurring payments.
    start = date(2026, 4, 3)
    gaps = [0, 12, 53, 19, 61, 14]
    when = start
    irregular = []
    for index, gap in enumerate(gaps):
        when = when + timedelta(days=gap)
        irregular.append(
            _transaction(f"ir{index}", "300", when, merchant="GARDEN SERVICES", category="Home",
                         description="GARDEN SERVICES")
        )
    customers.append(
        Customer(
            "14-irregular-recurring-payments",
            "14 Irregular recurring payments",
            irregular,
            [],
            note="Payments at unpredictable intervals are not a recurring commitment.",
        )
    )

    # 15. Insufficient transaction history.
    customers.append(
        Customer(
            "15-insufficient-history",
            "15 Insufficient transaction history",
            [
                _transaction("n1", "199", date(2026, 9, 1), merchant="NETFLIX", category="Subscriptions"),
                _fee("f1", 69, date(2026, 9, 2), "MONTHLY ACCOUNT FEE"),
                _transaction("g1", "250", date(2026, 9, 9), merchant="CHECKERS", category="Groceries"),
            ],
            [],
        )
    )

    # 16. A real duplicate card charge (extra).
    customers.append(
        Customer(
            "16-duplicate-card-charge",
            "Extra: duplicate card charge",
            [
                _transaction("a", "349", date(2026, 8, 18), merchant="TAKEALOT", category="Shopping",
                             transaction_time=time(12, 0)),
                _transaction("b", "349", date(2026, 8, 18), merchant="TAKEALOT", category="Shopping",
                             transaction_time=time(12, 2)),
                _transaction("g1", "420", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
            ],
            [Expected("duplicate_payment_leak", "duplicate_merchant_payment", "TAKEALOT",
                      monthly_impact=D("349"), evidence_status="possible")],
        )
    )

    # 17. Repeated immediate-payment fees (extra).
    fees = [
        _fee(f"ip{m}-{i}", 10, date(2026, m, 2 + i), "IMMEDIATE PAYMENT FEE")
        for m in (6, 7, 8, 9)
        for i in range(6)
    ]
    customers.append(
        Customer(
            "17-immediate-payment-fees",
            "Extra: repeated immediate payment fees",
            [*fees, _transaction("z", "50", date(2026, 10, 3), merchant="CHECKERS", category="Groceries")],
            [Expected("bank_fee_leak", "immediate_payment_fee", None, monthly_impact=D("60"),
                      evidence_status="confirmed")],
        )
    )

    # 18. International transaction fees (extra).
    customers.append(
        Customer(
            "18-international-fees",
            "Extra: international transaction fees",
            [
                *[_fee(f"fx{m}", 35, date(2026, m, 9), "FOREIGN TRANSACTION FEE") for m in (6, 7, 8, 9)],
                _transaction("z", "50", date(2026, 10, 3), merchant="CHECKERS", category="Groceries"),
            ],
            [Expected("bank_fee_leak", "foreign_transaction_fee", None, monthly_impact=D("35"),
                      evidence_status="confirmed")],
        )
    )

    # 19. Funeral cover with two providers over the same months.
    customers.append(
        Customer(
            "19-overlapping-funeral-cover",
            "Extra: funeral cover with two providers",
            [
                *_monthly("c", [180] * 6, "CLIENTELE", category="Insurance", day=1),
                *_monthly("a", [120] * 6, "AVBOB", category="Insurance", day=3),
            ],
            [
                Expected("overlapping_cover_leak", "overlapping_cover", None, monthly_impact=D("300.00")),
                Expected("recurring_payment_leak", None, "CLIENTELE", monthly_impact=D("180.00")),
                Expected("recurring_payment_leak", None, "AVBOB", monthly_impact=D("120.00")),
            ],
            expected_recurring_total=D("300.00"),
            note="The combined finding and each policy describe the same premiums.",
        )
    )

    # 20. One funeral policy is not overlapping cover.
    customers.append(
        Customer(
            "20-single-funeral-policy",
            "Extra: one funeral policy",
            _monthly("c", [180] * 6, "CLIENTELE", category="Insurance", day=1),
            [Expected("recurring_payment_leak", None, "CLIENTELE", monthly_impact=D("180.00"))],
        )
    )

    # 21. Regular betting: R2,100 paid in over four months.
    customers.append(
        Customer(
            "21-regular-betting",
            "Extra: regular betting payments",
            [
                _transaction(f"b{index}", str(amount), date(2026, month, day), merchant="HOLLYWOODBETS",
                             category="Gambling", description="HOLLYWOODBETS")
                for index, (month, day, amount) in enumerate(
                    [(4, 3, 200), (4, 17, 250), (5, 2, 300), (5, 20, 200),
                     (6, 5, 350), (6, 22, 250), (7, 4, 300), (7, 19, 250)]
                )
            ],
            [Expected("gambling_spending_leak", "gambling_spending", "HOLLYWOODBETS",
                      evidence_status="possible", observed_total=D("2100"))],
        )
    )

    # 22. A few small bets are not a finding.
    customers.append(
        Customer(
            "22-occasional-betting",
            "Extra: occasional small bets",
            [
                _transaction("b1", "50", date(2026, 4, 10), merchant="BETWAY", category="Gambling"),
                _transaction("b2", "40", date(2026, 6, 12), merchant="BETWAY", category="Gambling"),
                _transaction("b3", "30", date(2026, 8, 14), merchant="BETWAY", category="Gambling"),
            ],
            [],
        )
    )

    # 23. Two instalment-credit providers repaid together.
    customers.append(
        Customer(
            "23-credit-stacking",
            "Extra: two credit providers repaid together",
            [
                *_monthly("p", [250] * 6, "PAYFLEX", category="Loans & Credit", day=2),
                *_monthly("m", [400] * 6, "MOBICRED", category="Loans & Credit", day=9),
            ],
            [Expected("high_cost_credit_leak", "credit_stacking", None, monthly_impact=D("650.00"))],
        )
    )

    # 24. Repayments to a short-term lender.
    customers.append(
        Customer(
            "24-short-term-lender",
            "Extra: repayments to a short-term lender",
            _monthly("f", [520] * 6, "FINBOND", category="Loans & Credit", day=25),
            [Expected("high_cost_credit_leak", "high_cost_lender_repayments", "FINBOND",
                      monthly_impact=D("520.00"), evidence_status="possible",
                      observed_total=D("3120"))],
        )
    )

    # 25. A municipal bill that stepped up twice.
    customers.append(
        Customer(
            "25-utility-bill-rise",
            "Extra: utility bill price rise",
            _monthly("u", [900, 900, 900, 980, 980, 1050], "CITY OF CAPE TOWN", category="Utilities",
                     day=7, description="DEBIT ORDER CITY OF CAPE TOWN"),
            [Expected("recurring_payment_leak", "debit_order_review", "CITY OF CAPE TOWN",
                      monthly_impact=D("150.00"))],
        )
    )

    # 26. School fees raised once and held.
    customers.append(
        Customer(
            "26-school-fee-rise",
            "Extra: school fee price rise",
            _monthly("s", [3200, 3200, 3200, 3500, 3500, 3500], "ST ANDREWS SCHOOL", category="Education",
                     day=1),
            [Expected("recurring_payment_leak", None, "ST ANDREWS SCHOOL", monthly_impact=D("300.00"))],
        )
    )

    return customers
