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


@pytest.mark.parametrize(
    ("description", "category", "merchant"),
    [
        ("Yoco *Moro Gelato Wi Cape Town", "Restaurants", "Moro Gelato Wi"),
        ("ANDYS SUSHI BAR SEA PO Cape Town", "Restaurants", "Andys Sushi Bar"),
        ("IMPORTERS COFFEE MERCH Cape Town", "Restaurants", "Importers Coffee Merch"),
        ("HELLO ASIA SUPERSTORE SEA POINT Inter account [REDACTED] from account...7378", "Groceries", "Hello Asia Superstore"),
    ],
)
def test_business_type_words_classify_small_merchants_at_low_confidence(description, category, merchant) -> None:
    result = classify_transaction(description, "debit")
    assert result.category_name == category
    assert result.merchant_name == merchant
    assert result.classification_confidence < 0.85  # a hint, never remembered as verified


@pytest.mark.parametrize(
    ("description", "merchant"),
    [
        ("CIPC", "CIPC"),
        ("U C T TRAFFIC DEPARTMEN RONDEBOSCH", "Traffic Department"),
        ("CTICC EVENTS CAPE TOWN", "CTICC"),
    ],
)
def test_state_fees_and_venue_are_named_even_without_a_catalogue_category(description, merchant) -> None:
    result = classify_transaction(description, "debit")
    assert result.merchant_name == merchant
    assert result.rule in {"merchant:government-fees", "merchant:cticc"}


@pytest.mark.parametrize("description", ["MARKET DAY", "THE KITCHEN SHOP", "Yoco *Hairtaylor Cape Town", "Yoco *Alice Designs Stellenbosch"])
def test_words_that_do_not_prove_a_business_type_stay_unknown(description: str) -> None:
    result = classify_transaction(description, "debit")
    assert result.transaction_class == "unknown" and not result.category_name


@pytest.mark.parametrize(
    ("description", "category"),
    [
        ("PAYU * UCT Student F", "Education"),
        ("UNISA TUITION", "Education"),
        ("PRO CUTS BARBER SANDTON", "Personal Care"),
        ("LUXE HAIR SALON CAPE TOWN", "Personal Care"),
    ],
)
def test_new_categories_are_assigned_when_a_word_proves_the_type(description: str, category: str) -> None:
    assert classify_transaction(description, "debit").category_name == category


def test_new_categories_fall_back_safely_when_the_catalogue_lacks_them() -> None:
    from decimal import Decimal

    from categorisation.service import CategorisableTransaction, categorise_batch
    from tests.test_categorisation import LIVE_CATEGORIES

    result = categorise_batch(
        [CategorisableTransaction("0", "CIPC", Decimal("-150"), "debit")], LIVE_CATEGORIES
    )["0"]
    assert result.category_name == "Other"
    assert result.merchant_name == "CIPC"
    with_category = categorise_batch(
        [CategorisableTransaction("0", "CIPC", Decimal("-150"), "debit")], LIVE_CATEGORIES + ["Government & Fees"]
    )["0"]
    assert with_category.category_name == "Government & Fees"
