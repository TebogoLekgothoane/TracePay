"""Anthropic (Claude) card charges are identified as a subscription, including when the
statement prints a foreign-currency amount in the description."""

import pytest

from categorisation.classifier import classify_transaction


@pytest.mark.parametrize(
    "description",
    [
        "POS Purchase 23.00 Anthropic* Cl",
        "POS Purchase Anthropic* Cl",
        "POS Purchase Anthropic Claude",
    ],
)
def test_anthropic_charges_are_claude_subscriptions(description):
    result = classify_transaction(description, "debit")
    assert result.merchant_name == "Claude"
    assert result.category_name == "Subscriptions"
    assert result.transaction_class == "spending"
