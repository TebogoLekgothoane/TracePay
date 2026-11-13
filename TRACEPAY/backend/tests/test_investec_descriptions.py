import pytest

from categorisation.classifier import classify_transaction


@pytest.mark.parametrize(
    ("description", "category"),
    [
        ("DOTSURE", "Insurance"),
        ("PINEAPPLE 260930", "Insurance"),
        ("Faster Payment Fee", "Bank Fees"),
    ],
)
def test_investec_debit_orders_are_recognised(description, category):
    assert classify_transaction(description, "debit").category_name == category


def test_faster_payment_fee_is_a_bank_fee_class():
    assert classify_transaction("Faster Payment Fee", "debit").transaction_class == "bank_fee"


def test_virgin_active_netcash_is_a_gym():
    result = classify_transaction("VIRGIN ACT NETCASH", "debit")
    assert result.category_name is not None
    assert result.transaction_class == "spending"
