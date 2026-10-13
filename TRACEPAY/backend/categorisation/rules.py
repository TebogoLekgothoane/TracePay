"""Ordered deterministic rules. Category names are identifiers resolved in Supabase."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Callable

from categorisation.normalize import normalize_description, normalize_for_matching


@dataclass(frozen=True)
class Rule:
    name: str
    category_name: str
    confidence: float
    matcher: Callable[[str, str], bool]
    transaction_class: str = "spending"


def contains(*phrases: str) -> Callable[[str, str], bool]:
    patterns = tuple(_bounded_phrase(phrase) for phrase in phrases)
    return lambda description, _transaction_type: any(
        pattern.search(description) for pattern in patterns
    )


def _bounded_phrase(phrase: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![A-Z0-9]){re.escape(phrase)}(?![A-Z0-9])")


# Longer phrases are listed first so "MR D FOOD" wins over "MR D" and
# "UBER EATS" wins over "UBER". Labels are the canonical merchant keys'
# display form. Card-purchase recovery uses this list; it is not a new
# category catalogue.
_RECOGNISED_MERCHANT_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Mr D", ("MR D FOOD", "MRD FOOD", "MR D")),
    ("Uber Eats", ("UBER EATS", "UBEREATS")),
    ("Pick n Pay", ("PICK N PAY", "PICKNPAY")),
    ("Woolworths", ("WOOLWORTHS",)),
    ("Checkers", ("CHECKERS",)),
    ("Shoprite", ("SHOPRITE",)),
    ("Spar Express", ("SPAR EXPRESS",)),
    ("Spar", ("SPAR",)),
    ("Food Lovers", ("FOOD LOVERS", "FOODLOVERS")),
    ("Nando's", ("NANDO'S", "NANDOS")),
    ("Mugg & Bean", ("MUGG & BEAN", "MUGG AND BEAN")),
    ("Debonairs", ("DEBONAIRS",)),
    ("Pizza Hut", ("PIZZA HUT",)),
    ("Ocean Basket", ("OCEAN BASKET",)),
    ("Kfc", ("KFC",)),
    ("Mcdonald's", ("MCDONALD'S", "MCDONALDS")),
    ("Steers", ("STEERS",)),
    ("Wimpy", ("WIMPY",)),
    ("Roman's Pizza", ("ROMAN'S PIZZA", "ROMANS")),
    ("Uber", ("UBER",)),
    ("Bolt", ("BOLT",)),
    ("Shell", ("SHELL",)),
    ("Engen", ("ENGEN",)),
    ("Bp", ("BP",)),
    ("Totalenergies", ("TOTALENERGIES",)),
    ("Sasol", ("SASOL",)),
    ("Netflix", ("NETFLIX",)),
    ("Spotify", ("SPOTIFY",)),
    ("Dstv", ("DSTV",)),
    ("Showmax", ("SHOWMAX",)),
    ("CapCut", ("CAPCUT", "CAP CUT", "CAPCUT VIDEO", "GOOGLE CAPCUT")),
    ("Google One", ("GOOGLE ONE",)),
    ("OpenArt", ("OPENART", "OPEN ART", "OPENART AI")),
    ("Adobe", ("ADOBE", "CREATIVE CLOUD")),
    ("Microsoft", ("MICROSOFT", "OFFICE 365", "M365")),
    ("Discord", ("DISCORD",)),
    ("Apple", ("APPLE", "ITUNES", "APP STORE")),
    ("PayShap", ("PAYSHAP", "PAY SHAP")),
    ("MTN MoMo", ("MTN MOMO", "MTNMOMO")),
    ("MTN", ("MTN",)),
    ("Vodacom", ("VODACOM",)),
    ("Cell C", ("CELL C", "CELLC")),
    ("Telkom", ("TELKOM",)),
)

_RECOGNISED_MERCHANT_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    sorted(
        (
            (_bounded_phrase(phrase), label)
            for label, phrases in _RECOGNISED_MERCHANT_GROUPS
            for phrase in phrases
        ),
        key=lambda item: len(item[0].pattern),
        reverse=True,
    )
)


def recognised_merchant_label(normalized_text: str) -> str | None:
    """Return the canonical merchant label when an existing merchant phrase matches."""
    if not normalized_text:
        return None
    for pattern, label in _RECOGNISED_MERCHANT_PATTERNS:
        if pattern.search(normalized_text):
            return label
    return None


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


_PURCHASE_REVERSAL = contains(
    "REFUND",
    "REVERSAL",
    "REVERSED",
    "CANCELLED",
    "CANCELED",
    "CORRECTION",
)
PURCHASE_REVERSAL_RULE = "description:purchase-reversal"


def is_purchase_reversal_description(description: str | None) -> bool:
    """True when the description says the entry undoes a payment.

    A credit alone is not enough: salary, interest, and other incoming payments
    stay on their own rules.
    """
    text = normalize_for_matching(description) or normalize_description(description)
    return _PURCHASE_REVERSAL(text, "")


RULES: tuple[Rule, ...] = (
    Rule(
        PURCHASE_REVERSAL_RULE,
        "",
        0.95,
        _PURCHASE_REVERSAL,
        transaction_class="unknown",
    ),
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
            "INSUFFICIENT FUNDS CHARGE",
            "NSF FEE",
            "NSF CHARGE",
            "LIMIT EXCEEDED FEE",
            "SERVICE FEE",
            "BANK FEE",
            "MONTHLY FEE",
            "ACCOUNT FEE",
            "TRANSACTION FEE",
            "IMMEDIATE PAYMENT FEE",
            "BALANCE ENQUIRY FEE",
            "ATM FEE",
            "OVERDRAFT FEE",
            "OVERDRAFT CHARGE",
            "OVERDRAFT INTEREST",
            "INTEREST CHARGED",
            "DEBIT INTEREST",
            "BANK CHARGES",
            "BANK CHARGE",
            "SERVICE CHARGES",
            "SERVICE CHARGE",
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
        "description:mobile-purchase-phone",
        "Airtime & Data",
        0.88,
        lambda description, _kind: (
            "MOBILE PURCHASE" in description
            and any(
                token in description
                for token in ("PHONE", "AIRTIME", "DATA", "MTN", "VODACOM", "CELL C", "TELKOM")
            )
            and recognised_merchant_label(description) is None
        ),
    ),
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
        "description:money-transferred",
        "Transfers",
        0.92,
        lambda description, _kind: (
            "MONEY TRANSFERRED" in description
            and bool(
                description.replace("MONEY TRANSFERRED IN FOR", "")
                .replace("MONEY TRANSFERRED OUT FROM", "")
                .replace("MONEY TRANSFERRED IN", "")
                .replace("MONEY TRANSFERRED OUT", "")
                .strip(" -/")
            )
            and not any(
                token in description
                for token in (
                    "GOALSAVE",
                    "LIVE BETTER",
                    "ROUND-UP TRANSFER",
                    "ROUND UP TRANSFER",
                    "INTEREST SWEEP",
                    "FIXED DEPOSIT",
                )
            )
        ),
        transaction_class="person_to_person",
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
