from collections import Counter
from decimal import Decimal

from .models import Transaction, ValidationResult


def reconcile_balances(transactions: list[Transaction]) -> str:
    with_balances = [item for item in transactions if item.balance is not None]
    if len(with_balances) < 2:
        return "not_available"
    ordered = sorted(with_balances, key=lambda item: (item.source_row, item.date))
    last = ordered[0].balance or Decimal("0")
    for previous, current in zip(ordered, ordered[1:]):
        # Include amounts of intervening rows that lack a printed balance.
        gap = [
            item.amount
            for item in transactions
            if previous.source_row < item.source_row <= current.source_row
        ]
        expected = last + sum(gap)
        if abs(expected - (current.balance or Decimal("0"))) > Decimal("0.02"):
            return "mismatch"
        last = current.balance or Decimal("0")
    return "verified"


def validate_transactions(
    transactions: list[Transaction],
    extraction_method: str,
    rows_detected: int,
    rows_rejected: int | None = None,
) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []
    keys = [(item.date, item.amount, item.description.casefold(), item.balance) for item in transactions]
    duplicates = sum(count - 1 for count in Counter(keys).values() if count > 1)
    rejected = max(rows_detected - len(transactions), 0) if rows_rejected is None else rows_rejected
    if duplicates:
        warnings.append(f"{duplicates} duplicate transaction row(s) detected.")
    if rejected:
        warnings.append(f"{rejected} transaction-like row(s) could not be normalized safely.")
    if not transactions:
        errors.append("No reliable transaction rows were extracted.")
    if extraction_method == "ocr":
        warnings.append("OCR was required. Review every transaction before saving.")
    if extraction_method == "ai":
        warnings.append("AI extraction was used. Review transactions if anything looks off.")
    if any(item.balance is not None and abs(item.balance) > 100_000_000 for item in transactions):
        warnings.append("Some balances look unusually large and need review.")
    reconciliation = reconcile_balances(transactions)
    if reconciliation == "mismatch":
        warnings.append("Statement balances do not reconcile across the extracted rows.")
    valid_ratio = len(transactions) / max(rows_detected, 1)
    extraction_signal = {
        "table": 1.0,
        "text": 0.75,
        "ai": 0.85,
        "ocr": 0.5,
        "unknown": 0.0,
    }.get(extraction_method, 0.0)
    duplicate_signal = max(0.0, 1.0 - (duplicates / max(len(transactions), 1)))
    balance_signal = {"verified": 1.0, "not_available": 0.5, "mismatch": 0.0}[reconciliation]
    confidence = round(
        max(0.0, min(1.0, (valid_ratio + extraction_signal + duplicate_signal + balance_signal) / 4)),
        3,
    )
    if confidence < 0.65:
        warnings.append("Extraction confidence is below the safe automatic-save threshold.")
    status = "failed" if errors else "warning" if warnings else "valid"
    return ValidationResult(
        status=status,
        confidence=confidence,
        errors=errors,
        warnings=warnings,
        transaction_count=len(transactions),
        rows_detected=rows_detected,
        rows_rejected=rejected,
        duplicate_count=duplicates,
        balance_reconciliation=reconciliation,
    )
