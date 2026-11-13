"""Betting, credit and cover providers must be recognised however a bank wraps the name.

The shapes below are the usual wrappers banks put around a payee (card purchase,
debit order, DebiCheck, app payment, trailing reference or card suffix). They are
assumed formats, not real statements: the repository holds real text for GoTyme
only. When a real statement from another bank shows a wrapper that is missed,
add it here.
"""

from __future__ import annotations

import pytest

from categorisation.classifier import classify_transaction

PROVIDERS = {
    "Gambling": ["HOLLYWOODBETS", "BETWAY", "SUPABETS", "SUNBET", "YESPLAY", "LOTTOSTAR", "POWERBALL"],
    "Loans & Credit": ["PAYFLEX", "MOBICRED", "PAYJUSTNOW", "FINBOND", "BAYPORT", "DIRECT AXIS"],
    "Insurance": ["CLIENTELE", "AVBOB", "ASSUPOL", "OLD MUTUAL"],
}
SHAPES = [
    "{p}",
    "POS PURCHASE {p}",
    "DEBIT ORDER {p}",
    "ACB DEBIT:EXTERNAL {p} 0123456789",
    "FNB App Payment To {p}",
    "Capitec Debit Order {p}",
    "PURCHASE {p} ZA 4512",
    "{p} *1234 CAPE TOWN ZA",
    "DEBICHECK {p} REF 9988123",
    "Online payment {p}",
    "{p} PTY LTD",
    "{p}.CO.ZA",
]
CASES = [
    (category, shape.format(p=name))
    for category, names in PROVIDERS.items()
    for name in names
    for shape in SHAPES
]


@pytest.mark.parametrize(("category", "description"), CASES)
def test_provider_is_categorised_through_the_bank_wrapper(category: str, description: str) -> None:
    result = classify_transaction(description, "debit")
    assert result.category_name == category
    assert result.transaction_class == "spending"
    assert result.merchant_name


@pytest.mark.parametrize(
    "description",
    ["HOLLYWOODBETS WITHDRAWAL", "BETWAY PAYOUT", "FINBOND REFUND"],
)
def test_money_coming_back_from_a_provider_is_not_spending(description: str) -> None:
    result = classify_transaction(description, "credit")
    assert result.transaction_class != "spending"
    assert result.category_name not in {"Gambling", "Loans & Credit"}


@pytest.mark.parametrize(
    "description",
    [
        "PAYMENT TO MR LEWIS",
        "EFT LEWIS MOTSEPE",
        "LOTTOMATICA CLEANERS",
        "HOME LOAN INSTALMENT",
        "VEHICLE FINANCE INSTALMENT",
        "JUMOKE BAKERY",
    ],
)
def test_look_alikes_are_not_taken_for_a_provider(description: str) -> None:
    result = classify_transaction(description, "debit")
    assert result.category_name not in {"Gambling", "Loans & Credit"}
