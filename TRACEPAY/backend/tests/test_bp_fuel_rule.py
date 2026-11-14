"""BP is a fuel brand on money out, but the bank's own prefix on credits."""

import pytest

from categorisation.classifier import classify_transaction


@pytest.mark.parametrize(
    "description",
    [
        "BP SALARY ACME LTD",
        "BP INTEREST PAID",
        "BP INTEREST PAID REF 00100 MANDATE",
        "BP CLIENT PAYMENT INV 1042",
        "BP TRANSFER FROM J SMITH",
        "BP REFUND AMAZON",
    ],
)
def test_bp_credits_are_not_fuel(description):
    result = classify_transaction(description, "credit")
    assert result.category_name != "Fuel", description
    assert result.merchant_name != "Bp", description


@pytest.mark.parametrize(
    "description",
    ["BP GARAGE 0042", "DD BP FUEL 0017", "BP ULTRA CITY"],
)
def test_bp_debits_are_still_fuel(description):
    result = classify_transaction(description, "debit")
    assert result.category_name == "Fuel", description


def test_bp_without_a_direction_is_not_fuel():
    # No direction means we cannot tell fuel from a bank credit, so the rule stays off.
    result = classify_transaction("BP GARAGE 0042", None)
    assert result.category_name != "Fuel"
