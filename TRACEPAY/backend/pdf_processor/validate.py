from collections import Counter
from decimal import Decimal

from .models import Transaction, ValidationResult


BALANCE_TOLERANCE = Decimal("0.02")


def balance_chain_checks(transactions: list[Transaction]) -> list[str]:
    """Check each row's printed balance against the one before it.

    Returns one status per transaction, in the same order as the input:

    - ``match``: the printed balance equals the previous printed balance plus the
      movements since (this row's amount included).
    - ``break``: it does not. The chain then continues from this row's printed
      balance, so one misread row does not mark every row after it.
    - ``unchecked``: the row prints no balance, or no earlier printed balance
      exists to check it against.
    """
    statuses = ["unchecked"] * len(transactions)
    ordered = sorted(
        range(len(transactions)),
        key=lambda i: (transactions[i].source_row, transactions[i].date),
    )
    previous_index: int | None = None
    last = Decimal("0")
    for index in ordered:
        current = transactions[index]
        if current.balance is None:
            continue
        if previous_index is None:
            previous_index = index
            last = current.balance
            continue
        previous = transactions[previous_index]
        # Include amounts of intervening rows that lack a printed balance.
        gap = [
            item.amount
            for item in transactions
            if previous.source_row < item.source_row <= current.source_row
        ]
        expected = last + sum(gap, Decimal("0"))
        broken = abs(expected - current.balance) > BALANCE_TOLERANCE
        statuses[index] = "break" if broken else "match"
        previous_index = index
        last = current.balance
    return statuses


def drop_repeated_printed_rows(transactions: list[Transaction]) -> list[Transaction]:
    """Drop a second copy of a row the statement already printed.

    The copy shares the date, amount, description and running balance. A real
    second charge moves that balance, so it is kept. A summary page that repeats
    the ledger does not.
    """
    seen: set[tuple] = set()
    kept: list[Transaction] = []
    for item in transactions:
        if item.balance is None:
            kept.append(item)
            continue
        key = (item.date, item.amount, item.description.casefold(), item.balance)
        if key in seen:
            continue
        seen.add(key)
        kept.append(item)
    return kept


def reconcile_balances(transactions: list[Transaction]) -> str:
    checks = balance_chain_checks(transactions)
    if not any(status != "unchecked" for status in checks):
        return "not_available"
    return "mismatch" if "break" in checks else "verified"


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
    if any(item.balance is not None and abs(item.balance) > 100_000_000 for item in transactions):
        warnings.append("Some balances look unusually large and need review.")
    reconciliation = reconcile_balances(transactions)
    if reconciliation == "mismatch":
        warnings.append("Statement balances do not reconcile across the extracted rows.")
    valid_ratio = len(transactions) / max(rows_detected, 1)
    extraction_signal = {
        "table": 1.0,
        "text": 0.75,
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


RECONCILIATION_TOLERANCE = Decimal("0.05")


def reconcile_opening_closing(
    opening: Decimal | None,
    closing: Decimal | None,
    transactions: list[Transaction],
    account_type: str | None = None,
) -> tuple[str, Decimal | None]:
    """Check opening balance + extracted movements against the closing balance.

    Returns ``(status, difference)``; ``difference`` is closing minus the
    figure the extracted rows imply, and is ``None`` when not checkable.
    Amounts are signed from the account holder's side (debits negative). Credit
    cards print the balance owed as a positive number, so a card is accepted
    when either the signed chain or the owed chain (owed falls as payments
    credit the card) closes.
    """
    if opening is None or closing is None or not transactions:
        return "not_available", None
    net = sum((item.amount for item in transactions), Decimal("0"))
    candidates = [closing - (opening + net)]
    if account_type == "credit_card":
        candidates.append(closing - (opening - net))
    best = min(candidates, key=abs)
    if abs(best) <= RECONCILIATION_TOLERANCE:
        return "verified", Decimal("0")
    return "mismatch", best
