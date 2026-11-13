"""Duplicate timing, price-increase thresholds, fee wording and the confirmed/possible split."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from categorisation.classifier import classify_transaction
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import _fee_subtype, _is_stepped_price_rise, build_financial_features
from leak_intelligence.leak_claims import attach_claims, claims_for
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.models import FeatureTransaction

USER = "user-a"
HEDGES = ("may ", "might", "could", "possibly", "probably", "perhaps")


def _tx(index: int, when: date, description: str, amount: str, kind: str = "debit") -> FeatureTransaction:
    categorisation = classify_transaction(description, kind)
    return FeatureTransaction(
        transaction_id=f"t{index}",
        user_id=USER,
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=categorisation.merchant_name,
        description=description,
        transaction_type=kind,  # type: ignore[arg-type]
        categorisation=categorisation,
    )


def _months(start: tuple[int, int], count: int):
    year, month = start
    for _ in range(count):
        yield year, month
        month += 1
        if month == 13:
            year, month = year + 1, 1


def _statement(start: tuple[int, int], count: int, extra: list[tuple[date, str, str]]):
    rows = []
    for year, month in _months(start, count):
        rows.append((date(year, month, 25), "SALARY ACME PTY LTD", "18000", "credit"))
        rows.append((date(year, month, 3), "POS PURCHASE WOOLWORTHS", "640", "debit"))
        rows.append((date(year, month, 11), "POS PURCHASE CHECKERS", "820", "debit"))
    rows += [(when, description, amount, "debit") for when, description, amount in extra]
    return [_tx(i, *row) for i, row in enumerate(sorted(rows, key=lambda item: item[0]))]


def _run(transactions, *, claims: bool = False):
    snapshot = build_financial_features(USER, transactions)
    behaviours = analyze_behaviour(snapshot)
    result = detect_leaks(snapshot, behaviours)
    if claims:
        result = attach_claims(attach_supporting_transactions(result, transactions))
    return snapshot, behaviours, result.leaks


def _monthly(day: int, start: tuple[int, int], count: int, description: str, amounts):
    amounts = [amounts] * count if isinstance(amounts, str) else list(amounts)
    return [
        (date(year, month, day), description, amount)
        for (year, month), amount in zip(_months(start, count), amounts)
    ]


def _duplicates(leaks):
    return [item for item in leaks if item.leak_type == "duplicate_debit_order_leak"]


# ---------------------------------------------------------------- duplicate timing


def _gym_with_second_collection(gap_days: int):
    extra = _monthly(25, (2026, 1), 9, "DEBIT ORDER PLANET FITNESS", "325")
    extra.append((date(2026, 9, 25) + timedelta(days=gap_days), "DEBIT ORDER PLANET FITNESS", "325"))
    return _statement((2026, 1), 10, extra)


@pytest.mark.parametrize("gap", [0, 4, 5])
def test_a_second_collection_within_five_days_keeps_the_usual_confidence(gap: int) -> None:
    _, _, leaks = _run(_gym_with_second_collection(gap))
    leak = _duplicates(leaks)[0]
    assert leak.evidence["date_gap_beyond_usual_shift"] is False


@pytest.mark.parametrize("gap", [6, 8, 10])
def test_a_monthly_second_collection_up_to_ten_days_later_is_still_a_possible_duplicate(gap: int) -> None:
    _, _, leaks = _run(_gym_with_second_collection(gap))
    leak = _duplicates(leaks)[0]
    assert leak.evidence["date_gap_beyond_usual_shift"] is True
    assert leak.confidence <= 0.60


def test_a_collection_eleven_days_later_is_not_a_duplicate() -> None:
    _, _, leaks = _run(_gym_with_second_collection(11))
    assert _duplicates(leaks) == []


def test_a_weekly_debit_order_is_never_read_as_duplicates() -> None:
    start = date(2026, 1, 2)
    extra = [(start + timedelta(days=7 * week), "DEBIT ORDER LEGACY ADMIN SERVICES", "99") for week in range(30)]
    _, _, leaks = _run(_statement((2026, 1), 8, extra))
    assert _duplicates(leaks) == []


# ------------------------------------------------------------ price-increase rules


def test_a_stepped_subscription_price_rise_is_found_and_costed_at_the_new_price() -> None:
    amounts = ["29"] * 5 + ["59"] * 5 + ["79"] * 4
    extra = _monthly(5, (2025, 8), 14, "GOOGLE ONE", amounts)
    _, behaviours, leaks = _run(_statement((2025, 8), 14, extra))
    assert any(
        item.behavior_type == "price_increase_pattern"
        and item.evidence["finding_focus"] == "subscription_price_creep"
        for item in behaviours.observations
    )
    leak = next(item for item in leaks if item.leak_type == "subscription_leak")
    # The impact is the rise (79 - 29); the service is still costed at the new price.
    assert leak.estimated_monthly_impact == Decimal("50.00")
    assert leak.evidence["service_cost_monthly"] == Decimal("79.00")
    assert leak.evidence["headline_impact_basis"] == "price_increase"
    assert leak.evidence["first_amount"] == Decimal("29")
    assert leak.evidence["latest_amount"] == Decimal("79")
    assert leak.evidence["price_increase_count"] == 2


def test_a_ten_percent_insurance_premium_rise_is_found() -> None:
    amounts = ["341"] * 12 + ["375"] * 12 + ["412"] * 9
    extra = _monthly(1, (2024, 1), 33, "DEBIT ORDER FUNERAL COVER SANLAM", amounts)
    _, behaviours, leaks = _run(_statement((2024, 1), 33, extra))
    observation = next(
        item for item in behaviours.observations if item.behavior_type == "price_increase_pattern"
    )
    assert observation.evidence["finding_focus"] == "insurance_premium_increase"
    leak = next(item for item in leaks if item.evidence.get("finding_focus") == "debit_order_review")
    assert leak.estimated_monthly_impact == Decimal("71.00")
    assert leak.evidence["service_cost_monthly"] == Decimal("412.00")


def test_a_small_cumulative_subscription_drift_is_still_ignored() -> None:
    extra = _monthly(1, (2026, 1), 6, "NETFLIX.COM", ["199", "201", "203", "205", "207", "209"])
    _, behaviours, _ = _run(_statement((2026, 1), 6, extra))
    assert not [item for item in behaviours.observations if item.behavior_type == "price_increase_pattern"]


def test_a_variable_municipal_bill_keeps_the_stricter_gate() -> None:
    extra = _monthly(1, (2026, 1), 6, "DEBIT ORDER CITY OF JHB", ["510", "520", "505", "515", "500", "540"])
    _, behaviours, _ = _run(_statement((2026, 1), 6, extra))
    assert not [item for item in behaviours.observations if item.behavior_type == "price_increase_pattern"]


@pytest.mark.parametrize(
    ("amounts", "expected"),
    [
        (["29", "29", "59", "59", "79"], True),
        (["29", "29", "59", "59", "79", "79"], True),
        (["29", "59", "29", "59"], False),
        (["79", "79", "59", "59"], False),
        (["29", "59", "79", "99"], False),
        (["50", "50", "50", "50"], False),
        (["29", "59", "79"], False),
    ],
)
def test_stepped_price_rise_needs_monotone_steps_each_held_twice(amounts: list[str], expected: bool) -> None:
    assert _is_stepped_price_rise([Decimal(item) for item in amounts]) is expected


# ------------------------------------------------------------------ wording


def _fee(description: str) -> str | None:
    return _fee_subtype(_tx(0, date(2026, 1, 1), description, "10"))


@pytest.mark.parametrize(
    ("description", "subtype"),
    [
        ("ATM TRANSACTION FEE", "atm"),
        ("ATM CHARGE", "atm"),
        ("CASH WITHDRAWAL CHARGE", "atm"),
        ("INTERNATIONAL TRANSACTION FEE", "foreign"),
        ("CURRENCY CONVERSION FEE", "foreign"),
        ("INTEREST ON OVERDRAFT", "interest"),
        ("ATM BALANCE ENQUIRY", "balance_enquiry"),
        ("ADMIN FEE", "account"),
    ],
)
def test_fee_subtypes_follow_realistic_wording(description: str, subtype: str) -> None:
    assert _fee(description) == subtype


@pytest.mark.parametrize("description", ["ATM CASH", "CASH AT ATM", "ATM W/D", "CASH ADVANCE"])
def test_more_cash_withdrawal_wording_is_recognised(description: str) -> None:
    assert classify_transaction(description, "debit").category_name == "Cash Withdrawal"


def test_a_cash_advance_fee_is_a_fee_not_a_withdrawal() -> None:
    assert classify_transaction("CASH ADVANCE FEE", "debit").transaction_class == "bank_fee"


# ------------------------------------------------------------ confirmed vs possible


def _balance_enquiry_leak():
    days = [2, 6, 9, 14, 20, 27]
    extra = [(date(2026, month, day), "ATM BALANCE ENQUIRY", "3.50") for month in (7, 8, 9) for day in days]
    _, _, leaks = _run(_statement((2026, 7), 3, extra), claims=True)
    return next(item for item in leaks if item.leak_type == "bank_fee_leak")


def test_a_fee_finding_states_what_was_paid_apart_from_what_may_be_avoidable() -> None:
    claims = _balance_enquiry_leak().claims
    assert claims is not None
    assert claims.confirmed[0].text == (
        "You paid the ATM balance enquiry fee 18 times, R63 in all, between 2 Jul 2026 and 27 Sep 2026."
    )
    assert claims.confirmed[0].figures["count"] == 18
    possible = claims.possible[0]
    assert possible.text.startswith("You may be able to avoid this fee")
    assert "balance" in possible.cannot_see[0]


def test_confirmed_facts_never_hedge_and_possible_leaks_always_say_what_is_unseen() -> None:
    extra = _monthly(25, (2026, 1), 9, "DEBIT ORDER PLANET FITNESS", "325")
    extra.append((date(2026, 10, 1), "DEBIT ORDER PLANET FITNESS", "325"))
    extra += _monthly(2, (2026, 1), 9, "DEBIT ORDER LEGACY ADMIN SERVICES", "189")
    for month in (3, 6, 8):
        extra.append((date(2026, month, 2), "Fee: Unsuccessful DISCOVERY INSURANCE insufficient funds", "42"))
    _, _, leaks = _run(_statement((2026, 1), 10, extra), claims=True)
    assert len(leaks) >= 3
    for leak in leaks:
        assert leak.claims is not None
        assert leak.claims.possible, leak.leak_type
        for fact in leak.claims.confirmed:
            assert not any(word in fact.text.lower() for word in HEDGES), fact.text
        for possible in leak.claims.possible:
            assert possible.cannot_see, possible.text


def test_a_duplicate_finding_confirms_the_two_payments_and_only_suspects_the_error() -> None:
    _, _, leaks = _run(_gym_with_second_collection(6), claims=True)
    claims = _duplicates(leaks)[0].claims
    assert claims.confirmed[0].text == (
        "R325 was paid to Planet Fitness twice, on 25 Sep 2026 and 1 Oct 2026 (6 days apart)."
    )
    assert claims.possible[0].text == "You may have been charged twice for the same thing."
    assert any("arrears" in item for item in claims.possible[0].cannot_see)


def test_a_price_rise_is_confirmed_as_an_amount_and_only_suspected_as_unannounced() -> None:
    amounts = ["29"] * 5 + ["59"] * 5 + ["79"] * 4
    extra = _monthly(5, (2025, 8), 14, "GOOGLE ONE", amounts)
    _, _, leaks = _run(_statement((2025, 8), 14, extra), claims=True)
    claims = next(item for item in leaks if item.leak_type == "subscription_leak").claims
    assert any("rose from R29 to R79, in 2 steps" in fact.text for fact in claims.confirmed)
    assert any("raised the price without you agreeing" in item.text for item in claims.possible)


def test_totals_are_not_quoted_when_the_supporting_rows_were_cut_off() -> None:
    leak = _balance_enquiry_leak()
    truncated = leak.model_copy(update={"supporting_transaction_count": 500})
    fact = claims_for(truncated).confirmed[0]
    assert "in all" not in fact.text
    assert "total" not in fact.figures
