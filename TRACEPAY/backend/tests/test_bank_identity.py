"""One-statement-per-bank identity helpers."""

from __future__ import annotations

import pytest

from pdf_processor.bank_identity import (
    BANK_UNIDENTIFIED_MESSAGE,
    assert_extracted_bank_matches_selected,
    normalize_statement_bank_key,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Capitec", "capitec"),
        ("capitec bank", "capitec"),
        ("FNB", "fnb"),
        ("First National Bank", "fnb"),
        ("Standard Bank", "standard bank"),
        ("Discovery Bank", "discovery bank"),
        ("TymeBank", "tymebank"),
        ("Absa", "absa"),
        ("African Bank", "african bank"),
        ("Nedbank", "nedbank"),
        ("Investec", "investec"),
        ("GoTyme", "tymebank"),
        ("Mystery Bank", None),
        ("", None),
        (None, None),
    ],
)
def test_normalize_statement_bank_key(raw: str | None, expected: str | None) -> None:
    assert normalize_statement_bank_key(raw) == expected


def test_first_upload_bank_match_allowed() -> None:
    assert assert_extracted_bank_matches_selected("Capitec", "Capitec") == "capitec"
    assert assert_extracted_bank_matches_selected("FNB", "First National") == "fnb"
    assert assert_extracted_bank_matches_selected("TymeBank", "GoTyme") == "tymebank"


def test_different_bank_keys_are_distinct() -> None:
    assert normalize_statement_bank_key("Capitec") != normalize_statement_bank_key("FNB")


def test_unidentified_extracted_bank_is_not_guessed() -> None:
    with pytest.raises(ValueError, match=BANK_UNIDENTIFIED_MESSAGE[:40]):
        assert_extracted_bank_matches_selected("Capitec", None)
    with pytest.raises(ValueError, match=BANK_UNIDENTIFIED_MESSAGE[:40]):
        assert_extracted_bank_matches_selected("Capitec", "Unknown Corp")


def test_mismatched_extracted_bank_is_rejected() -> None:
    with pytest.raises(ValueError, match="looks like a FNB statement"):
        assert_extracted_bank_matches_selected("Capitec", "FNB")
