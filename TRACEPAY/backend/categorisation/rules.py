"""Ordered deterministic rules. Category names are identifiers resolved in Supabase."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Callable


@dataclass(frozen=True)
class Rule:
    name: str
    category_name: str
    confidence: float
    matcher: Callable[[str, str], bool]
    transaction_class: str = "spending"


def contains(*phrases: str) -> Callable[[str, str], bool]:
    patterns = tuple(
        re.compile(rf"(?<![A-Z0-9]){re.escape(phrase)}(?![A-Z0-9])") for phrase in phrases
    )
    return lambda description, _transaction_type: any(
        pattern.search(description) for pattern in patterns
    )


def incoming_contains(*phrases: str) -> Callable[[str, str], bool]:
    matcher = contains(*phrases)
    return lambda description, transaction_type: (
        transaction_type == "credit" and matcher(description, transaction_type)
    )


def contains_fragment(*fragments: str) -> Callable[[str, str], bool]:
    """Match known bank-compressed merchant fragments such as S2SAubsSpaza."""
    return lambda description, _transaction_type: any(
        fragment in description for fragment in fragments
    )


RULES: tuple[Rule, ...] = (
    Rule(
        "merchant:salary-advance",
        "Other Income",
        0.90,
        incoming_contains("SALARY ADVANCE"),
        transaction_class="income",
    ),
    # Fees before merchant tokens so "Insufficient Funds Fee: Uber" stays a bank fee.
    Rule(
        "description:service-fee",
        "Bank Fees",
        0.95,
        contains(
            "SMS NOTIFICATION FEE",
            "NOTIFICATION FEE",
            "MONTHLY ACCOUNT ADMIN FEE",
            "ACCOUNT ADMIN FEE",
            "INSUFFICIENT FUNDS FEE",
            "LIMIT EXCEEDED FEE",
            "SERVICE FEE",
            "BANK FEE",
            "MONTHLY FEE",
            "ACCOUNT FEE",
            "TRANSACTION FEE",
            "ATM FEE",
            "BANK CHARGES",
            "SERVICE CHARGES",
        ),
        transaction_class="bank_fee",
    ),
    Rule("merchant:woolworths", "Groceries", 1.00, contains("WOOLWORTHS")),
    Rule("merchant:checkers", "Groceries", 1.00, contains("CHECKERS")),
    Rule("merchant:shoprite", "Groceries", 1.00, contains("SHOPRITE")),
    Rule("merchant:pick-n-pay", "Groceries", 1.00, contains("PICK N PAY", "PICKNPAY")),
    Rule("merchant:spar", "Groceries", 1.00, contains("SPAR")),
    Rule("merchant:foodlovers", "Groceries", 1.00, contains("FOODLOVERS", "FOOD LOVERS")),
    Rule(
        "merchant:food-and-spaza",
        "Groceries",
        0.90,
        lambda description, kind: contains("TROPICAL FRUIT", "TROPICAL FOOD")(description, kind)
        or contains_fragment("SPAZA")(description, kind),
    ),
    Rule("merchant:nandos", "Restaurants", 1.00, contains("NANDO'S", "NANDOS")),
    Rule("merchant:mugg-and-bean", "Restaurants", 1.00, contains("MUGG & BEAN", "MUGG AND BEAN")),
    Rule("merchant:debonairs", "Restaurants", 1.00, contains("DEBONAIRS")),
    Rule("merchant:pizza-hut", "Restaurants", 1.00, contains("PIZZA HUT")),
    Rule("merchant:ocean-basket", "Restaurants", 1.00, contains("OCEAN BASKET")),
    Rule("merchant:kfc", "Fast Food", 1.00, contains("KFC")),
    Rule("merchant:mcdonalds", "Fast Food", 1.00, contains("MCDONALDS", "MCDONALD'S")),
    Rule("merchant:steers", "Fast Food", 1.00, contains("STEERS")),
    Rule("merchant:wimpy", "Fast Food", 1.00, contains("WIMPY")),
    Rule("merchant:romans", "Fast Food", 1.00, contains("ROMANS", "ROMAN'S PIZZA")),
    Rule(
        "merchant:food-delivery",
        "Fast Food",
        0.95,
        contains("UBER EATS", "MR D FOOD", "MRD FOOD", "MR D ", "UBEREATS"),
    ),
    Rule("merchant:uber", "Ride Hailing", 1.00, contains("UBER")),
    Rule("merchant:bolt", "Ride Hailing", 1.00, contains("BOLT")),
    Rule("merchant:shell", "Fuel", 1.00, contains("SHELL")),
    Rule("merchant:engen", "Fuel", 1.00, contains("ENGEN")),
    Rule("merchant:bp", "Fuel", 1.00, contains("BP")),
    Rule("merchant:total", "Fuel", 1.00, contains("TOTALENERGIES")),
    Rule("merchant:sasol", "Fuel", 1.00, contains("SASOL")),
    Rule(
        "merchant:public-transport",
        "Public Transport",
        1.00,
        contains("INTERCAPE", "GREYHOUND", "MYCITI", "GAUTRAIN", "PRASA"),
    ),
    Rule(
        "merchant:airtime-data",
        "Airtime & Data",
        1.00,
        contains(
            "MTN AIRTIME",
            "MTN DATA",
            "MTN PREPAID",
            "PREPAID PURCHASE MTN",
            "PREPAID PURCHASE: MTN",
            "VODACOM AIRTIME",
            "VODACOM DATA",
            "VODACOM PREPAID",
            "PREPAID PURCHASE VODACOM",
            "TELKOM AIRTIME",
            "TELKOM DATA",
            "TELKOM MOBILE",
            "CELL C AIRTIME",
            "CELL C DATA",
            "CELL C PREPAID",
            "AIRTIME ADVANCE",
        ),
    ),
    Rule(
        "description:prepaid-airtime",
        "Airtime & Data",
        0.92,
        lambda description, _kind: (
            "PREPAID" in description
            and any(token in description for token in ("MTN", "VODACOM", "CELL C", "TELKOM"))
        ),
    ),
    Rule(
        "merchant:subscriptions",
        "Subscriptions",
        1.00,
        contains("NETFLIX", "SPOTIFY", "DSTV", "SHOWMAX", "APPLE.COM/BILL", "GOOGLE *SERVICES", "APPLE COM BILL"),
    ),
    Rule("description:data-bundle", "Airtime & Data", 0.95, contains("DATA BUNDLE")),
    Rule(
        "description:cash-withdrawal",
        "Cash Withdrawal",
        0.95,
        contains("CASH WITHDRAWAL", "ATM WITHDRAWAL", "CASH OUT"),
    ),
    Rule(
        "description:goalsave",
        "Transfers",
        0.95,
        contains("GOALSAVE"),
        transaction_class="internal_transfer",
    ),
    Rule(
        "description:live-better",
        "Transfers",
        0.93,
        contains("LIVE BETTER", "ROUND-UP TRANSFER", "ROUND UP TRANSFER", "INTEREST SWEEP"),
        transaction_class="internal_transfer",
    ),
    Rule(
        "description:savings-transfer",
        "Transfers",
        0.92,
        lambda description, _kind: "TRANSFER" in description
        and any(token in description for token in ("SAVINGS", "LIVE BETTER")),
        transaction_class="internal_transfer",
    ),
    Rule(
        "description:fixed-deposit",
        "Savings",
        0.95,
        contains("FIXED DEPOSIT"),
        transaction_class="savings",
    ),
    Rule(
        "description:person-payment",
        "Transfers",
        0.92,
        contains(
            "SENDMONEY",
            "SEND MONEY",
            "PAY BENEFICIARY",
            "PAYSHAP",
            "PAY SHAP",
            "PAY BY SHAP",
            "PAY BY SHAPID",
            "IMMEDIATE PAYMENT",
            "EXTERNAL PAYSHAP",
            "EXTERNAL PAYMENT",
            "CASH SENT",
            "CAPITEC PAY",
        ),
        transaction_class="person_to_person",
    ),
    Rule(
        "description:payment-received",
        "Other Income",
        0.80,
        incoming_contains("PAYMENT RECEIVED"),
        transaction_class="income",
    ),
    Rule(
        "description:online-mtn",
        "Airtime & Data",
        0.90,
        contains("ONLINE PURCHASE: MTN", "ONLINE PURCHASE MTN"),
    ),
    Rule(
        "description:interest-received",
        "Other Income",
        0.90,
        incoming_contains("INTEREST RECEIVED", "INTEREST EARNED"),
        transaction_class="income",
    ),
    Rule(
        "description:electricity",
        "Utilities",
        0.90,
        contains("ELECTRICITY", "ESKOM", "PREPAID POWER"),
    ),
    Rule(
        "merchant:salary",
        "Salary",
        1.00,
        incoming_contains("SALARY", "PAYROLL", "WAGES", "MONTHLY SALARY"),
        transaction_class="income",
    ),
)
