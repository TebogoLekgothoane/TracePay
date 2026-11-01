"""Overlapping cover, betting and lottery spending, high-cost credit, and bill price rises."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from leak_intelligence.commitment_groups import (
    cover_provider,
    credit_provider,
    is_gambling_merchant,
)
from tests.test_leak_detection import _detect, _transaction, _types


def _series(
    prefix: str,
    amounts: list[int],
    merchant: str,
    *,
    category: str,
    day: int = 1,
    start: int = 4,
    description: str | None = None,
):
    return [
        _transaction(
            f"{prefix}{index}",
            str(amount),
            date(2026, start + index, day),
            merchant=merchant,
            category=category,
            description=description or merchant,
        )
        for index, amount in enumerate(amounts)
    ]


def _leaks(transactions, leak_type: str):
    return [item for item in _detect(transactions).leaks if item.leak_type == leak_type]


def test_provider_matching_is_by_known_names_only() -> None:
    assert cover_provider("CLIENTELE") == "clientele"
    assert cover_provider("DISCOVERY INSURE") is None
    assert cover_provider("OUTSURANCE") is None
    assert is_gambling_merchant("Hollywoodbets")
    assert is_gambling_merchant("NATIONAL LOTTERY")
    assert not is_gambling_merchant("LOTTOMATICA CLEANERS")
    assert credit_provider("Finbond") == ("FINBOND", True)
    assert credit_provider("Payflex") == ("payflex", False)
    assert credit_provider("WOOLWORTHS") is None


def test_funeral_cover_with_two_providers_is_flagged_without_assuming_waste() -> None:
    transactions = [
        *_series("c", [180] * 6, "CLIENTELE", category="Insurance", day=1),
        *_series("a", [120] * 6, "AVBOB", category="Insurance", day=3),
    ]
    (leak,) = _leaks(transactions, "overlapping_cover_leak")
    assert leak.estimated_monthly_impact == Decimal("300.00")
    assert leak.evidence["possible_overlap_monthly"] == Decimal("120.00")
    assert leak.evidence["provider_count"] == 2
    assert leak.evidence["no_redundancy_assumed"] is True
    assert set(leak.evidence["combined_merchants"]) == {"CLIENTELE", "AVBOB"}


def test_overlapping_cover_ignores_one_provider_and_short_term_insurers() -> None:
    one = _series("c", [180] * 6, "CLIENTELE", category="Insurance")
    assert _leaks(one, "overlapping_cover_leak") == []
    # Two short-term insurers usually insure two different cars or homes.
    short_term = [
        *_series("d", [450] * 6, "DISCOVERY INSURE", category="Insurance"),
        *_series("o", [380] * 6, "OUTSURANCE", category="Insurance", day=3),
    ]
    assert _leaks(short_term, "overlapping_cover_leak") == []


def test_overlapping_cover_needs_the_policies_to_run_in_the_same_months() -> None:
    switched = [
        *_series("c", [180] * 3, "CLIENTELE", category="Insurance", start=4),
        *_series("a", [120] * 3, "AVBOB", category="Insurance", start=7),
    ]
    assert _leaks(switched, "overlapping_cover_leak") == []


def test_regular_betting_is_reported_as_what_was_paid_in() -> None:
    transactions = []
    for index, (month, day, amount) in enumerate(
        [(4, 3, 200), (4, 17, 250), (5, 2, 300), (5, 20, 200), (6, 5, 350), (6, 22, 250), (7, 4, 300), (7, 19, 250)]
    ):
        transactions.append(
            _transaction(
                f"b{index}", str(amount), date(2026, month, day),
                merchant="HOLLYWOODBETS", category="Gambling", description="HOLLYWOODBETS",
            )
        )
    (leak,) = _leaks(transactions, "gambling_spending_leak")
    assert leak.evidence["observed_total_paid"] == Decimal("2100")
    assert leak.evidence["winnings_not_netted"] is True
    assert leak.evidence["evidence_status"] == "possible"
    assert "judgement" in leak.description
    # The generic recurring finding would only repeat it.
    assert "recurring_payment_leak" not in {item.leak_type for item in _detect(transactions).leaks}


def test_occasional_small_betting_is_not_flagged() -> None:
    transactions = [
        _transaction("b1", "50", date(2026, 4, 10), merchant="BETWAY", category="Gambling", description="BETWAY"),
        _transaction("b2", "40", date(2026, 6, 12), merchant="BETWAY", category="Gambling", description="BETWAY"),
        _transaction("b3", "30", date(2026, 8, 14), merchant="BETWAY", category="Gambling", description="BETWAY"),
    ]
    assert "gambling_spending_leak" not in _types(transactions)


def test_credit_repayments_running_together_are_flagged() -> None:
    transactions = [
        *_series("p", [250] * 6, "PAYFLEX", category="Loans & Credit", day=2),
        *_series("m", [400] * 6, "MOBICRED", category="Loans & Credit", day=9),
    ]
    (leak,) = _leaks(transactions, "high_cost_credit_leak")
    assert leak.evidence["finding_focus"] == "credit_stacking"
    assert leak.estimated_monthly_impact == Decimal("650.00")
    assert leak.evidence["includes_high_cost_lender"] is False


def test_a_costly_lender_is_flagged_once_and_asks_for_the_rate() -> None:
    transactions = _series("f", [520] * 6, "FINBOND", category="Loans & Credit", day=25)
    leaks = [item for item in _detect(transactions).leaks]
    assert [item.leak_type for item in leaks] == ["high_cost_credit_leak"]
    leak = leaks[0]
    assert leak.evidence["finding_focus"] == "high_cost_lender_repayments"
    assert leak.evidence["evidence_status"] == "possible"
    assert "interest rate" in leak.evidence["verification_prompt"]


def test_one_instalment_provider_is_not_a_high_cost_finding() -> None:
    transactions = _series("p", [250] * 6, "PAYFLEX", category="Loans & Credit", day=2)
    assert "high_cost_credit_leak" not in _types(transactions)


def test_utility_bill_price_rise_is_reported_on_the_recurring_finding() -> None:
    transactions = _series(
        "u", [900, 900, 900, 980, 980, 1050], "CITY OF CAPE TOWN", category="Utilities", day=7,
        description="DEBIT ORDER CITY OF CAPE TOWN",
    )
    leaks = [item for item in _detect(transactions).leaks if item.evidence.get("price_increase_monthly")]
    assert leaks, "a stepped-up bill should carry its price rise"
    leak = leaks[0]
    assert leak.evidence["price_change_focus"] in {
        "recurring_bill_price_increase",
        "debit_order_amount_increase",
    }
    assert leak.evidence["original_recurring_amount"] == Decimal("900")
    assert leak.evidence["current_recurring_amount"] == Decimal("1050")


def test_flat_bill_has_no_price_rise() -> None:
    transactions = _series("u", [900] * 6, "CITY OF CAPE TOWN", category="Utilities", day=7)
    assert not [
        item for item in _detect(transactions).leaks if item.evidence.get("price_increase_monthly")
    ]


def test_school_fee_increase_uses_the_bill_focus() -> None:
    transactions = _series(
        "s", [3200, 3200, 3200, 3500, 3500, 3500], "ST ANDREWS SCHOOL", category="Education", day=1
    )
    leaks = [item for item in _detect(transactions).leaks if item.evidence.get("price_increase_monthly")]
    assert leaks
    assert leaks[0].evidence["price_change_focus"] == "recurring_bill_price_increase"
