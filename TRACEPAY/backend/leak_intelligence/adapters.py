"""Validated adapters into the pure financial feature domain."""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal, InvalidOperation
from typing import Any, Mapping

from categorisation.models import CategorisationResult

from .models import FeatureTransaction

_CLASSES = {
    "spending",
    "income",
    "internal_transfer",
    "person_to_person",
    "savings",
    "investment",
    "bank_fee",
    "unknown",
}
_TYPES = {"debit", "credit"}


class FeatureRowValidationError(ValueError):
    """Raised when a source transaction cannot safely enter feature calculation."""


def feature_transaction_from_row(row: Mapping[str, Any], *, expected_user_id: str) -> FeatureTransaction:
    """Convert a canonical transaction row without recategorising it.

    The expected user id is mandatory because feature calculations must never
    accidentally combine transaction histories from separate users.
    """
    user_id = _required_text(row, "user_id")
    if user_id != expected_user_id:
        raise FeatureRowValidationError("Transaction user does not match the requested user.")

    transaction_class = _optional_text(row, "transaction_class") or "unknown"
    if transaction_class not in _CLASSES:
        raise FeatureRowValidationError("Transaction has an unsupported classification.")
    transaction_type = _optional_text(row, "type")
    if transaction_type is not None and transaction_type not in _TYPES:
        raise FeatureRowValidationError("Transaction has an unsupported type.")

    category_name = _category_name(row.get("categories"))
    category_confidence = _confidence(row.get("category_confidence"))
    classification_confidence = _confidence(row.get("classification_confidence"))
    result = CategorisationResult(
        category_name=category_name,
        category_confidence=category_confidence,
        transaction_class=transaction_class,
        classification_confidence=classification_confidence,
        classification_reason=_optional_text(row, "classification_reason"),
        merchant_name=_optional_text(row, "merchant_name"),
        rule=_optional_text(row, "category_rule"),
    )
    return FeatureTransaction(
        transaction_id=_required_text(row, "id"),
        user_id=user_id,
        amount=_decimal(row.get("amount")),
        categorisation=result,
        description=_optional_text(row, "description") or "",
        merchant_name=_optional_text(row, "merchant_name"),
        transaction_date=_date(row.get("date")),
        transaction_time=_time(row.get("transaction_time")),
        transaction_type=transaction_type,
        is_duplicate=bool(row.get("is_duplicate", False)),
        statement_id=_optional_text(row, "statement_id"),
        balance=_decimal(row["balance"]) if row.get("balance") not in (None, "") else None,
        account_id=_optional_text(row, "account_id"),
        bank_key=_optional_text(row, "bank_key"),
        account_last4=_account_last4(row.get("accounts")),
        currency=_optional_text(row, "currency"),
        reference=_optional_text(row, "reference"),
        value_date=_date(row.get("value_date")),
        booking_date=_date(row.get("booking_date")),
        date_confidence=_choice(row, "date_confidence", _DATE_CONFIDENCES),
        source_row=_optional_int(row.get("source_row")),
        dedupe_status=_choice(row, "dedupe_status", _DEDUPE_STATUSES) or "unique",
        transfer_status=_choice(row, "transfer_status", _TRANSFER_STATUSES) or "none",
        transfer_pair_id=_optional_text(row, "transfer_pair_id"),
        transfer_fee_for=_optional_text(row, "transfer_fee_for"),
        reversal_of=_optional_text(row, "reversal_of"),
    )


_DATE_CONFIDENCES = {"high", "medium", "low"}
_DEDUPE_STATUSES = {"unique", "overlap_duplicate", "possible_duplicate"}
_TRANSFER_STATUSES = {"none", "candidate", "confirmed"}


def _choice(row: Mapping[str, Any], key: str, allowed: set[str]) -> str | None:
    value = _optional_text(row, key)
    return value if value in allowed else None


def _optional_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _account_last4(value: Any) -> str | None:
    if isinstance(value, list) and value:
        value = value[0]
    if not isinstance(value, Mapping):
        return None
    digits = value.get("last_four_digits")
    return digits if isinstance(digits, str) and len(digits) == 4 and digits.isdigit() else None


def _required_text(row: Mapping[str, Any], key: str) -> str:
    value = _optional_text(row, key)
    if not value:
        raise FeatureRowValidationError(f"Transaction {key} is required.")
    return value


def _optional_text(row: Mapping[str, Any], key: str) -> str | None:
    value = row.get(key)
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _decimal(value: Any) -> Decimal:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as error:
        raise FeatureRowValidationError("Transaction amount is invalid.") from error
    if not number.is_finite():
        raise FeatureRowValidationError("Transaction amount is invalid.")
    return number


def _date(value: Any) -> date | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise FeatureRowValidationError("Transaction date is invalid.")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise FeatureRowValidationError("Transaction date is invalid.") from error


def _time(value: Any) -> time | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise FeatureRowValidationError("Transaction time is invalid.")
    try:
        return time.fromisoformat(value)
    except ValueError as error:
        raise FeatureRowValidationError("Transaction time is invalid.") from error


def _confidence(value: Any) -> float:
    try:
        confidence = float(value or 0)
    except (TypeError, ValueError) as error:
        raise FeatureRowValidationError("Transaction confidence is invalid.") from error
    if not 0 <= confidence <= 1:
        raise FeatureRowValidationError("Transaction confidence is invalid.")
    return confidence


def _category_name(value: Any) -> str | None:
    if isinstance(value, Mapping):
        name = value.get("name")
        return name.strip() if isinstance(name, str) and name.strip() else None
    if isinstance(value, list) and value and isinstance(value[0], Mapping):
        return _category_name(value[0])
    return None
