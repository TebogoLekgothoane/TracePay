"""Canonical bank keys for one-statement-per-bank enforcement.

Mirrors mobile statement-bank.ts and public.normalize_statement_bank_key().
"""

from __future__ import annotations

import re

BANK_ALREADY_UPLOADED_MESSAGE = (
    "You've already uploaded a statement from this bank. "
    "TracePay currently allows one statement per bank."
)

BANK_UNIDENTIFIED_MESSAGE = (
    "We couldn't confidently identify the bank on this statement. "
    "Please verify you selected the correct bank, or try a clearer statement PDF."
)

BANK_MISMATCH_MESSAGE = (
    "This statement appears to be from a different bank than the one you selected. "
    "Please verify the bank and try again."
)

# Longest / most specific aliases first (aligned with statement_schema._BANK_ALIASES).
# GoTyme (Tyme Group) maps to TymeBank — TracePay's supported Tyme slot.
_BANK_KEY_ALIASES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?<![a-z0-9])go\s*tyme(?![a-z0-9])"), "tymebank"),
    (re.compile(r"^gotyme$"), "tymebank"),
    (re.compile(r"(?<![a-z0-9])tyme\s*bank(?![a-z0-9])"), "tymebank"),
    (re.compile(r"^tymebank$"), "tymebank"),
    (re.compile(r"(?<![a-z0-9])standard\s*bank(?![a-z0-9])"), "standard bank"),
    (re.compile(r"(?<![a-z0-9])first\s*national(?![a-z0-9])"), "fnb"),
    (re.compile(r"(?<![a-z0-9])fnb(?![a-z0-9])"), "fnb"),
    (re.compile(r"(?<![a-z0-9])discovery\s*bank(?![a-z0-9])"), "discovery bank"),
    (re.compile(r"^discovery$"), "discovery bank"),
    (re.compile(r"(?<![a-z0-9])african\s*bank(?![a-z0-9])"), "african bank"),
    (re.compile(r"(?<![a-z0-9])capitec(?![a-z0-9])"), "capitec"),
    (re.compile(r"(?<![a-z0-9])nedbank(?![a-z0-9])"), "nedbank"),
    (re.compile(r"(?<![a-z0-9])investec(?![a-z0-9])"), "investec"),
    (re.compile(r"(?<![a-z0-9])absa(?![a-z0-9])"), "absa"),
)


def normalize_statement_bank_key(raw: str | None) -> str | None:
    if raw is None:
        return None
    haystack = raw.strip().casefold()
    if not haystack:
        return None
    for pattern, key in _BANK_KEY_ALIASES:
        if pattern.search(haystack):
            return key
    return None


def assert_extracted_bank_matches_selected(
    selected_institution: str | None,
    extracted_bank: str | None,
) -> str:
    """Return the shared bank key or raise ValueError with a user-facing message."""
    selected_key = normalize_statement_bank_key(selected_institution)
    if selected_key is None:
        raise ValueError(
            "Select a supported bank before uploading a statement."
        )
    extracted_key = normalize_statement_bank_key(extracted_bank)
    if extracted_key is None:
        raise ValueError(BANK_UNIDENTIFIED_MESSAGE)
    if extracted_key != selected_key:
        selected_label = (selected_institution or "").strip()
        extracted_label = (extracted_bank or "").strip()
        if selected_label and extracted_label:
            raise ValueError(
                f"This PDF looks like a {extracted_label} statement, "
                f"but you selected {selected_label}. "
                "Choose the matching bank and try again."
            )
        raise ValueError(BANK_MISMATCH_MESSAGE)
    return selected_key
