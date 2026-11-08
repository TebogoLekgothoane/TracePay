"""Well-known merchants seen on real statements that the rules used to miss."""

import pytest

from categorisation.classifier import classify_transaction


@pytest.mark.parametrize(
    ("description", "category", "merchant"),
    [
        ("TAKEALOT", "Shopping", "Takealot"),
        ("TAKEALOT.COM 4521", "Shopping", "Takealot"),
        ("MCD Green Point (0187) Cape Town", "Fast Food", "Mcdonald's"),
        ("MCD Seapoint (0465) Cape Town", "Fast Food", "Mcdonald's"),
        ("MCDONALDS WATERFRONT", "Fast Food", "Mcdonald's"),
        ("OVERLEAF SHARELATEX 21.00 USD", "Subscriptions", "Overleaf"),
        ("STR PARKING CT 26 SEA POINT", "Transport", None),
        ("Interpark Cavendish Durban", "Transport", "Interpark"),
        ("SUNSET PHARMACY - CKS C CAPE TOWN", "Healthcare", None),
        ("CLICKS PHARMACY SEA POINT", "Healthcare", None),
        ("DIS-CHEM CAVENDISH", "Healthcare", None),
    ],
)
def test_missed_merchants_are_now_recognised(description: str, category: str, merchant: str | None) -> None:
    result = classify_transaction(description, "debit")
    assert result.category_name == category
    assert result.transaction_class == "spending"
    if merchant:
        assert result.merchant_name == merchant


@pytest.mark.parametrize(
    "description",
    [
        "TAKEALOT REFUND",
        "SUNSET PHARMACY REFUND",
        "STR PARKING REFUND",
    ],
)
def test_refunds_and_credits_are_not_treated_as_charges(description: str) -> None:
    result = classify_transaction(description, "credit")
    assert result.rule not in {"merchant:takealot", "description:pharmacy", "description:parking"}


@pytest.mark.parametrize("description", ["MCDONALDS", "MCDONALD'S"])
def test_existing_mcdonalds_spellings_still_match(description: str) -> None:
    assert classify_transaction(description, "debit").category_name == "Fast Food"


@pytest.mark.parametrize("description", ["CIPC", "CTICC EVENTS CAPE TOWN", "Yoco *Moro Gelato Wi Cape Town"])
def test_ambiguous_lines_are_left_for_the_directory_or_ai(description: str) -> None:
    result = classify_transaction(description, "debit")
    assert result.transaction_class == "unknown" and not result.category_name
