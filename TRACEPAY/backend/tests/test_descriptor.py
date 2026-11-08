import pytest

from categorisation.descriptor import parse_descriptor
from categorisation.merchant_directory import pattern_key_for


@pytest.mark.parametrize(
    ("description", "name", "processor", "location"),
    [
        ("Yoco *Moro Gelato Wi Cape Town", "Moro Gelato Wi", "YOCO", "CAPE TOWN"),
        ("Yoco   *Alice Designs Stellenbosch", "Alice Designs", "YOCO", "STELLENBOSCH"),
        ("PAYFAST*Bobo Asian mar", "Bobo Asian Mar", "PAYFAST", None),
        ("PAYSTACK    *PROPUP", "Propup", "PAYSTACK", None),
        ("ANDYS SUSHI BAR SEA PO Cape Town", "Andys Sushi Bar", None, "SEA PO CAPE TOWN"),
        ("MCD Green Point (0187) Cape Town", "MCD", None, "GREEN POINT CAPE TOWN"),
        ("ENGEN SEA POINT Tokai", "Engen", None, "SEA POINT TOKAI"),
        ("HELLO ASIA SUPERSTORE SEA POINT Inter account transfer from account...7378", "Hello Asia Superstore", None, "SEA POINT"),
    ],
)
def test_trading_name_is_separated_from_processor_place_and_account_text(description, name, processor, location) -> None:
    parsed = parse_descriptor(description)
    assert parsed.display_name == name
    assert parsed.processor == processor
    assert parsed.location == location


@pytest.mark.parametrize("description", ["CAPE TOWN", "Yoco *Cape Town", "Takealot", "George Burger", "Sandton City Cafe Express"])
def test_nothing_is_stripped_that_would_empty_or_change_the_name(description: str) -> None:
    parsed = parse_descriptor(description)
    assert parsed.merchant
    assert "TAKEALOT" in parsed.merchant or parsed.merchant.split()[0] in description.upper()


def test_the_same_shop_is_one_directory_entry_however_it_was_paid() -> None:
    keys = {
        pattern_key_for("Yoco *Moro Gelato Cape Town"),
        pattern_key_for("PAYFAST*Moro Gelato"),
        pattern_key_for("MORO GELATO SEA POINT Cape Town"),
    }
    assert keys == {"MORO GELATO"}


def test_account_wording_never_reaches_a_directory_key() -> None:
    key = pattern_key_for("HELLO ASIA SUPERSTORE SEA POINT Inter account [REDACTED] from account...7378")
    assert key == "HELLO ASIA SUPERSTORE"


@pytest.mark.parametrize("description", ["Yoco *Ben", "Yoco *DDC Cape Town", "PAYFAST*AB"])
def test_generic_single_word_names_are_not_shared(description: str) -> None:
    assert pattern_key_for(description) is None


def test_ai_prompt_gets_the_trading_name_not_the_processor_line() -> None:
    import json

    from categorisation.ai_classifier import AiTransaction, _build_instructions

    items = [
        AiTransaction("1", "Yoco *Moro Gelato Wi Cape Town", "-60", "debit"),
        AiTransaction("2", "Mabaso Trading Post", "-90", "debit"),
    ]
    text = _build_instructions(items, ["Restaurants", "Shopping"])
    payload = json.loads(text.split("Transactions: ", 1)[1])
    assert payload[0] == {
        "transaction_id": "1", "name": "Moro Gelato Wi", "paid_via": "Yoco", "place": "Cape Town", "type": "debit",
    }
    assert payload[1] == {"transaction_id": "2", "description": "Mabaso Trading Post", "type": "debit"}
    assert "Yoco *" not in text.split("Transactions: ", 1)[1]
    assert "amount" not in text.split("Transactions: ", 1)[1].lower()
