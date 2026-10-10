"""Common South African fee descriptions reach the existing fee pipeline."""

from datetime import date
from decimal import Decimal

import pytest

from categorisation.classifier import classify_transaction
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction


@pytest.mark.parametrize(
    "description",
    [
        "IMMEDIATE PAYMENT FEE",
        "BALANCE ENQUIRY FEE",
        "SERVICE CHARGE",
        "BANK CHARGE",
        "MONTHLY ACCOUNT FEE",
        "FOREIGN TRANSACTION FEE",
    ],
)
def test_explicit_fee_descriptions_are_bank_fees(description: str) -> None:
    result = classify_transaction(description, "debit")
    assert result.transaction_class == "bank_fee"
    assert result.category_name == "Bank Fees"
    assert result.rule == "description:service-fee"


def test_immediate_payment_without_a_fee_stays_person_to_person() -> None:
    result = classify_transaction("IMMEDIATE PAYMENT TO J MAPHOSA", "debit")
    assert result.transaction_class == "person_to_person"
    assert result.category_name == "Transfers"
    assert result.rule == "description:person-payment"


def _classified(
    transaction_id: str,
    amount: str,
    when: date,
    description: str,
) -> FeatureTransaction:
    categorisation = classify_transaction(description, "debit")
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=categorisation.merchant_name,
        description=description,
        transaction_type="debit",
        categorisation=categorisation,
    )


def test_repeated_immediate_payment_fees_use_the_existing_fee_leak() -> None:
    transactions = []
    for month, count in ((7, 4), (8, 8)):
        for index in range(count):
            day = (30 if month == 7 else 31) if index == count - 1 else min(2 + index, 27)
            transactions.append(
                _classified(f"fee-{month}-{index}", "8.00", date(2026, month, day), "IMMEDIATE PAYMENT FEE")
            )
    assert {item.categorisation.transaction_class for item in transactions} == {"bank_fee"}

    snapshot = build_financial_features("user-a", transactions)
    leaks = detect_leaks(snapshot, analyze_behaviour(snapshot))
    leak = next(item for item in leaks.leaks if item.leak_type == "bank_fee_leak")

    assert snapshot.transaction_count == 12
    assert (snapshot.date_end - snapshot.date_start).days >= 28
    assert snapshot.fees.bank_fee_total == Decimal("96.00")
    assert snapshot.fees.immediate_payment_fee_total == Decimal("96.00")
    assert leak.evidence["finding_focus"] == "immediate_payment_fee"
    assert leak.title == "Potential immediate payment fee burden"
