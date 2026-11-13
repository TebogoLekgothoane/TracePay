"""Regular payments to the same person: found by cadence, never by naming them."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.payee_candidates import person_payment_candidates, person_recipient
from tests.test_leak_detection import _detect, _transaction

CAPITEC = "Payment to TE LEKGOTHOANE Capitec, Mobile No. +27•••••4013, T. LEKGOTHOANE"


def _transfer(tx_id: str, amount: str, when: date, description: str, **kwargs):
    kwargs.setdefault("merchant", None)
    kwargs.setdefault("category", "Transfers")
    kwargs.setdefault("transaction_class", "person_to_person")
    return _transaction(tx_id, amount, when, description=description, **kwargs)


def _monthly(prefix: str, amounts: list[int], description: str, *, day: int = 1, start: int = 4):
    return [
        _transfer(f"{prefix}{index}", str(amount), date(2026, start + index, day), description)
        for index, amount in enumerate(amounts)
    ]


def _context():
    return [
        _transaction("ctx-a", "310", date(2026, 3, 2), merchant="CHECKERS", category="Groceries"),
        _transaction("ctx-b", "275", date(2026, 10, 2), merchant="PICK N PAY", category="Groceries"),
    ]


def _findings(transactions):
    found = _detect([*transactions, *_context()]).leaks
    return [item for item in found if item.leak_type == "recurring_transfer_leak"]


def test_recipient_is_hashed_and_labelled_without_the_name_or_number() -> None:
    key, label = person_recipient(_transfer("a", "1500", date(2026, 4, 1), CAPITEC))
    assert label == "a recipient ending 4013"
    assert "LEKGOTHOANE" not in key and "4013" not in key
    assert len(key) == 12
    initials_key, initials_label = person_recipient(
        _transfer("b", "1500", date(2026, 4, 1), "SENDMONEY JANE DOE")
    )
    assert initials_label == "a recipient (J. D.)"
    assert initials_key != key


def test_monthly_support_payments_are_one_finding_that_asks_what_they_are_for() -> None:
    (leak,) = _findings(_monthly("s", [1500] * 6, "SENDMONEY JANE DOE"))
    assert leak.estimated_monthly_impact == Decimal("1500")
    assert leak.evidence["cadence"] == "monthly"
    assert leak.evidence["amount_stable"] is True
    assert leak.evidence["evidence_status"] == "possible"
    assert "rent" in leak.evidence["verification_prompt"]
    assert "not a confirmed loss" in leak.description


def test_the_finding_carries_no_name_or_number() -> None:
    (leak,) = _findings(_monthly("s", [1500] * 6, CAPITEC))
    text = f"{leak.title} {leak.description} {leak.evidence}".upper()
    assert "LEKGOTHOANE" not in text
    assert "+27" not in text and "TE LEK" not in text


def test_payments_in_the_same_pattern_to_two_people_are_two_findings() -> None:
    transactions = [
        *_monthly("a", [1500] * 6, "SENDMONEY JANE DOE", day=1),
        *_monthly("b", [800] * 6, "SENDMONEY SIPHO NKOSI", day=15),
    ]
    assert len(_findings(transactions)) == 2


def test_irregular_small_or_few_payments_are_not_findings() -> None:
    two = _monthly("t", [1500, 1500], "SENDMONEY JANE DOE")
    assert _findings(two) == []
    scattered = [
        _transfer("r1", "400", date(2026, 4, 3), "SENDMONEY JANE DOE"),
        _transfer("r2", "400", date(2026, 4, 19), "SENDMONEY JANE DOE"),
        _transfer("r3", "400", date(2026, 7, 2), "SENDMONEY JANE DOE"),
        _transfer("r4", "400", date(2026, 7, 5), "SENDMONEY JANE DOE"),
    ]
    assert _findings(scattered) == []
    small = _monthly("m", [60] * 6, "SENDMONEY JANE DOE")
    assert _findings(small) == []
    uneven = _monthly("u", [120, 900, 150, 1400, 100, 700], "SENDMONEY JANE DOE")
    assert _findings(uneven) == []


def test_money_received_and_own_account_moves_are_not_payments_to_a_person() -> None:
    received = [
        _transfer(f"c{i}", "1500", date(2026, 4 + i, 1), "SENDMONEY JANE DOE", transaction_type="credit")
        for i in range(6)
    ]
    assert person_payment_candidates(received) == []
    internal = [
        _transfer(f"i{i}", "1500", date(2026, 4 + i, 1), "SENDMONEY JANE DOE",
                  transaction_class="internal_transfer")
        for i in range(6)
    ]
    assert person_payment_candidates(internal) == []


def test_supporting_payments_are_attached_by_the_full_pipeline() -> None:
    transactions = [*_monthly("s", [1500] * 6, "SENDMONEY JANE DOE"), *_context()]
    result = attach_supporting_transactions(_detect(transactions), transactions)
    (leak,) = [item for item in result.leaks if item.leak_type == "recurring_transfer_leak"]
    assert leak.supporting_transaction_count == 6
    assert {row.role for row in leak.supporting_transactions} == {"payment"}
