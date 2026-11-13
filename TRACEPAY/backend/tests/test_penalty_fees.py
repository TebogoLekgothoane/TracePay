"""Late-payment and similar penalties charged by a provider, not the bank."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from leak_intelligence.payee_candidates import penalty_fee_candidates
from tests.test_leak_detection import _detect, _transaction


def _penalty(tx_id: str, amount: str, when: date, description: str, **kwargs):
    kwargs.setdefault("merchant", "VODACOM")
    kwargs.setdefault("category", "Airtime & Data")
    return _transaction(tx_id, amount, when, description=description, **kwargs)


def _context():
    """Ordinary spending around the penalties: the engine needs a month of history."""
    return [
        _transaction("ctx-a", "310", date(2026, 4, 2), merchant="CHECKERS", category="Groceries"),
        _transaction("ctx-b", "275", date(2026, 9, 30), merchant="PICK N PAY", category="Groceries"),
    ]


def _findings(transactions):
    found = _detect([*transactions, *_context()]).leaks
    return [item for item in found if item.leak_type == "penalty_fee_leak"]


def test_one_late_fee_is_a_confirmed_charge_with_no_claim_about_avoidability() -> None:
    (leak,) = _findings([_penalty("a", "125", date(2026, 7, 19), "VODACOM LATE PAYMENT FEE")])
    assert leak.estimated_monthly_impact == Decimal("125")
    assert leak.impact_kind == "one_time"
    assert leak.estimated_annual_impact is None
    assert leak.evidence["evidence_status"] == "confirmed"
    assert leak.evidence["repeated_across_months"] is False
    assert "does not say whether it could have been avoided" in leak.description


def test_penalties_in_several_months_are_one_finding_for_the_payee() -> None:
    (leak,) = _findings(
        [
            _penalty("a", "180", date(2026, 5, 14), "CITY POWER RECONNECTION FEE", merchant="CITY POWER"),
            _penalty("b", "180", date(2026, 8, 9), "CITY POWER RECONNECTION FEE", merchant="CITY POWER"),
        ]
    )
    assert leak.estimated_monthly_impact == Decimal("360")
    assert leak.evidence["repeated_across_months"] is True
    assert leak.evidence["penalty_months"] == ["2026-05", "2026-08"]
    assert leak.evidence["penalty_transaction_ids"] == ["a", "b"]


def test_bank_owned_fees_credits_reversals_and_small_amounts_are_not_penalties() -> None:
    transactions = [
        _transaction("bank", "69", date(2026, 6, 2), merchant=None, category="Bank Fees",
                     transaction_class="bank_fee", description="UNPAID DEBIT ORDER FEE"),
        _penalty("credit", "125", date(2026, 7, 1), "VODACOM LATE PAYMENT FEE REFUND", transaction_type="credit"),
        _penalty("small", "5", date(2026, 7, 2), "VODACOM LATE FEE"),
        _penalty("plain", "699", date(2026, 7, 3), "VODACOM CONTRACT"),
    ]
    assert penalty_fee_candidates(transactions) == []
    assert _findings(transactions) == []


def test_penalty_wording_variants_are_recognised() -> None:
    for description in (
        "MUNICIPALITY PENALTY INTEREST",
        "ACME REINSTATEMENT FEE",
        "ACME OVERDUE CHARGE",
        "ACME ARREARS INTEREST",
        "ACME LATE SETTLEMENT",
    ):
        found = penalty_fee_candidates(
            [_penalty("x", "150", date(2026, 7, 1), description, merchant="ACME", category="Other")]
        )
        assert len(found) == 1, description
