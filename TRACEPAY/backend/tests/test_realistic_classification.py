"""Common South African bank wording is recognised instead of falling to unknown."""

from datetime import date
from decimal import Decimal

import pytest

from categorisation.classifier import classify_transaction
from categorisation.source_identity import identify_source
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import _fee_subtype, build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction


def _row(description: str, kind: str = "debit"):
    return classify_transaction(description, kind)


@pytest.mark.parametrize(
    "description",
    [
        "UNPAID ITEM FEE",
        "Unpaid Debit Order Fee",
        "DEBIT ORDER UNPAID FEE",
        "RETURNED ITEM FEE",
        "DISHONOURED ITEM FEE",
        "ADMIN FEE",
        "MONTHLY MANAGEMENT FEE",
        "STATEMENT FEE",
        "ANNUAL FEE",
        "CARD FEE",
        "ATM WITHDRAWAL FEE",
        "ATM CASH WITHDRAWAL FEE",
        "CASH WITHDRAWAL FEE",
        "CASH BACK FEE",
        "CASHBACK FEE",
        "ATM BALANCE ENQUIRY",
        "SMS ALERT FEE",
        "INTERNATIONAL TRANSACTION FEE",
        "VAS FEE",
        "INTEREST ON OVERDRAFT",
    ],
)
def test_realistic_fee_wording_is_a_bank_fee(description: str) -> None:
    result = _row(description)
    assert result.transaction_class == "bank_fee"
    assert result.category_name == "Bank Fees"


def test_a_fee_row_does_not_invent_a_merchant_from_its_own_wording() -> None:
    assert identify_source("DEBIT ORDER UNPAID FEE").merchant_name is None
    assert _row("DEBIT ORDER UNPAID FEE").merchant_name is None


@pytest.mark.parametrize(
    ("description", "merchant"),
    [
        ("DEBIT ORDER SANTAM INSURANCE", "Santam"),
        ("DEBIT ORDER DISCOVERY LIFE", "Discovery Insure"),
        ("ACB DEBIT :EXTERNAL OUTSURANCE 0123", "Outsurance"),
        ("DEBIT ORDER FUNERAL COVER SANLAM", "Sanlam"),
        ("INSURANCE PREMIUM OLD MUTUAL", "Old Mutual"),
        ("DEBIT ORDER AVBOB FUNERAL", "Avbob"),
        ("OUTSURANCE PREMIUM", "Outsurance"),
    ],
)
def test_insurers_are_insurance_with_a_named_merchant(description: str, merchant: str) -> None:
    result = _row(description)
    assert (result.transaction_class, result.category_name) == ("spending", "Insurance")
    assert identify_source(description).merchant_name == merchant


def test_bank_branded_cover_is_insurance_even_without_a_merchant_name() -> None:
    result = _row("FNB INSURANCE PREMIUM")
    assert result.category_name == "Insurance"


def test_medical_aid_is_healthcare_and_not_life_cover() -> None:
    assert _row("DEBIT ORDER MOMENTUM HEALTH").category_name == "Healthcare"
    assert _row("DEBIT ORDER DISCOVERY HEALTH").category_name == "Healthcare"
    assert _row("MEDICAL AID CONTRIBUTION").category_name == "Healthcare"
    assert _row("DEBIT ORDER MOMENTUM").category_name == "Insurance"


def test_unnamed_debit_order_is_spending_with_the_collector_as_merchant() -> None:
    result = _row("DEBIT ORDER LEGACY ADMIN SERVICES")
    assert (result.transaction_class, result.category_name) == ("spending", "Other")
    assert result.rule == "description:debit-order"
    assert identify_source("DEBIT ORDER LEGACY ADMIN SERVICES").merchant_name == "Legacy Admin Services"


def test_bare_debit_order_wording_has_no_merchant() -> None:
    assert identify_source("DEBIT ORDER").merchant_name is None


@pytest.mark.parametrize(
    "description",
    [
        "FNB APP PREPAID AIRTIME 0821234567",
        "AIRTIME PURCHASE",
        "DATA TOP UP",
        "PREPAID DATA VODACOM",
        "DEBIT ORDER VODACOM CONTRACT",
        "MTN CONTRACT",
        "OUT OF BUNDLE CHARGES MTN",
    ],
)
def test_airtime_data_and_network_billing(description: str) -> None:
    assert _row(description).category_name == "Airtime & Data"


@pytest.mark.parametrize(
    "description",
    [
        "ICLOUD STORAGE",
        "DROPBOX*CLOUD STORAGE",
        "NORDVPN.COM",
        "DUOLINGO PLUS",
        "DEBIT ORDER VIRGIN ACTIVE",
        "DEBIT ORDER PLANET FITNESS",
        "PREMIUM SMS DAILY TIPS",
    ],
)
def test_subscriptions_memberships_and_premium_sms(description: str) -> None:
    result = _row(description)
    assert (result.transaction_class, result.category_name) == ("spending", "Subscriptions")


@pytest.mark.parametrize(
    ("description", "kind", "expected_class"),
    [
        ("INSURANCE CLAIM PAYOUT", "credit", "unknown"),
        ("SANLAM REFUND", "credit", "unknown"),
        ("MTN MOMO SEND", "debit", "unknown"),
        ("ATM CASH WITHDRAWAL FNB", "debit", "spending"),
        ("IMMEDIATE PAYMENT TO J MAPHOSA", "debit", "person_to_person"),
        ("PAYSHAP PAYMENT TO J SMITH", "debit", "person_to_person"),
        ("SALARY ACME PTY LTD", "credit", "income"),
    ],
)
def test_look_alikes_keep_their_existing_classification(
    description: str, kind: str, expected_class: str
) -> None:
    assert _row(description, kind).transaction_class == expected_class


def test_a_credit_is_never_read_as_an_insurance_or_debit_order_charge() -> None:
    assert _row("DEBIT ORDER RETURNED", "credit").transaction_class == "unknown"
    assert _row("INSURANCE PAYOUT", "credit").category_name != "Insurance"


def test_cash_withdrawal_stays_a_withdrawal_but_its_fee_is_a_fee() -> None:
    assert _row("ATM CASH WITHDRAWAL FNB").category_name == "Cash Withdrawal"
    assert _row("ATM WITHDRAWAL FEE").category_name == "Bank Fees"


def _tx(index: int, when: date, description: str, amount: str, kind: str = "debit") -> FeatureTransaction:
    categorisation = classify_transaction(description, kind)
    return FeatureTransaction(
        transaction_id=f"t{index}",
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=categorisation.merchant_name,
        description=description,
        transaction_type=kind,  # type: ignore[arg-type]
        categorisation=categorisation,
    )


def _history(extra: list[tuple[date, str, str]], months=(1, 2, 3, 4, 5, 6, 7, 8, 9)):
    rows = []
    for month in months:
        rows.append((date(2026, month, 25), "SALARY ACME PTY LTD", "18000", "credit"))
        rows.append((date(2026, month, 3), "POS PURCHASE WOOLWORTHS", "640", "debit"))
        rows.append((date(2026, month, 11), "POS PURCHASE CHECKERS", "820", "debit"))
    rows += [(when, description, amount, "debit") for when, description, amount in extra]
    return [_tx(i, *row) for i, row in enumerate(sorted(rows, key=lambda item: item[0]))]


def _leaks(transactions):
    snapshot = build_financial_features("user-a", transactions)
    return snapshot, detect_leaks(snapshot, analyze_behaviour(snapshot)).leaks


def test_fee_subtypes_follow_the_new_wording() -> None:
    def subtype(description: str) -> str | None:
        return _fee_subtype(_tx(0, date(2026, 1, 1), description, "10"))

    assert subtype("ATM WITHDRAWAL FEE") == "atm"
    assert subtype("CASH WITHDRAWAL FEE") == "atm"
    assert subtype("ATM BALANCE ENQUIRY") == "balance_enquiry"
    assert subtype("ADMIN FEE") == "account"
    assert subtype("MONTHLY MANAGEMENT FEE") == "account"


def test_unnamed_debit_order_reaches_the_recurring_review() -> None:
    extra = [(date(2026, month, 2), "DEBIT ORDER LEGACY ADMIN SERVICES", "189") for month in range(1, 10)]
    _, leaks = _leaks(_history(extra))
    leak = next(item for item in leaks if item.evidence.get("finding_focus") == "debit_order_review")
    assert leak.evidence["merchant_key"] == "LEGACY ADMIN SERVICES"
    assert leak.estimated_monthly_impact == Decimal("189")


def test_insurer_debit_order_reaches_the_recurring_review() -> None:
    extra = [(date(2026, month, 2), "DEBIT ORDER SANTAM INSURANCE", "189") for month in range(1, 10)]
    _, leaks = _leaks(_history(extra))
    leak = next(item for item in leaks if item.evidence.get("finding_focus") == "debit_order_review")
    assert leak.evidence["merchant_key"] == "SANTAM"


def test_atm_withdrawal_fee_text_reaches_the_fee_stacking_finding() -> None:
    extra = []
    for month in (7, 8, 9):
        for index in range(4):
            when = date(2026, month, 2 + index * 3)
            extra.append((when, "ATM CASH WITHDRAWAL FNB", "200"))
            extra.append((when, "ATM WITHDRAWAL FEE", "11.80"))
    _, leaks = _leaks(_history(extra, months=(7, 8, 9)))
    leak = next(item for item in leaks if item.leak_type == "cash_usage_leak")
    assert leak.evidence["finding_focus"] == "atm_withdrawal_fee_stacking"


def test_atm_balance_enquiry_text_reaches_the_balance_enquiry_finding() -> None:
    days = [2, 6, 9, 14, 20, 27]
    extra = [(date(2026, month, day), "ATM BALANCE ENQUIRY", "3.50") for month in (7, 8, 9) for day in days]
    _, leaks = _leaks(_history(extra, months=(7, 8, 9)))
    leak = next(item for item in leaks if item.leak_type == "bank_fee_leak")
    assert leak.evidence["finding_focus"] == "atm_balance_enquiry"
