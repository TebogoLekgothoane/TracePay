"""Bank wording the rules must read: fees, mobile bundles, named-account transfers, family payees.

Every description here is invented. They copy the shapes South African statements print.
"""

from __future__ import annotations

import pytest

from categorisation.classifier import classify_transaction


def _kind(description: str, kind: str):
    return classify_transaction(description, kind)


@pytest.mark.parametrize(
    "description",
    ["ATM/SSD FEE 25/04 - 27/05", "Instant payment fee", "MAINTENANCE FEE", "SERVICE FEE 26/06 - 27/07"],
)
def test_account_and_atm_fees_are_bank_fees(description: str) -> None:
    assert _kind(description, "debit").transaction_class == "bank_fee"


def test_debit_interest_printed_as_one_word_is_a_bank_fee_but_credit_interest_is_not() -> None:
    assert _kind("INTEREST 28/05 - 25/06", "debit").transaction_class == "bank_fee"
    assert _kind("INTEREST 28/05 - 25/06", "credit").transaction_class != "bank_fee"


def test_a_late_payment_fee_is_still_a_penalty_not_an_ordinary_bank_fee() -> None:
    assert _kind("VODACOM LATE PAYMENT FEE", "debit").transaction_class != "bank_fee"


@pytest.mark.parametrize(
    "description",
    ["MTN 1.5 GB 0736438387", "MTN 30 Min All Net 0736438", "Vodacom Rush Hour 150 MB", "CELL C 500 MB BUNDLE"],
)
def test_mobile_data_and_voice_bundles_are_airtime_and_data(description: str) -> None:
    result = _kind(description, "debit")
    assert result.rule == "description:mobile-bundle"
    assert result.transaction_class == "spending"


def test_a_mobile_wallet_is_not_a_bundle() -> None:
    assert _kind("MTN MOMO 30 MIN", "debit").rule != "description:mobile-bundle"


def test_savings_style_named_account_moves_are_internal_transfers_in_both_directions() -> None:
    for kind in ("debit", "credit"):
        assert _kind("my savings - 2036565441", kind).transaction_class == "internal_transfer"
        assert _kind("EMERGENCY FUND - 2070181820", kind).transaction_class == "internal_transfer"


def test_other_named_account_lines_are_payments_to_a_person_not_purchases() -> None:
    for kind in ("debit", "credit"):
        assert _kind("Example Boutique - 2029", kind).transaction_class == "person_to_person"


def test_card_purchases_are_not_mistaken_for_named_account_lines() -> None:
    assert _kind("SPAR SOUTH 517992001175", "debit").transaction_class == "spending"


@pytest.mark.parametrize("description", ["Mummy", "Daddy", "Gran"])
def test_family_nicknames_are_person_to_person(description: str) -> None:
    for kind in ("debit", "credit"):
        assert _kind(description, kind).transaction_class == "person_to_person"


def test_credit_from_a_company_is_income_but_a_company_refund_is_not() -> None:
    assert _kind("Example Works (pty)ltd", "credit").transaction_class == "income"
    assert _kind("Example Works (pty)ltd", "debit").transaction_class != "income"
    assert _kind("Example Works (pty)ltd REFUND", "credit").transaction_class != "income"


def test_investment_account_moves_are_not_income() -> None:
    assert _kind("CAP JUSTINVEST 70295793999", "credit").transaction_class == "investment"


def test_a_card_reference_glued_to_a_truncated_name_does_not_hide_the_merchant() -> None:
    from categorisation.normalize import normalize_for_matching

    assert normalize_for_matching("Example Shop Sout517992001175") == "EXAMPLE SHOP SOUT"
    assert _kind("Naked Insuranc517992001175", "debit").rule == "merchant:insurer"
