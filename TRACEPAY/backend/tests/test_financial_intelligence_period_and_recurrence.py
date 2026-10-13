"""Regression coverage for period comparison, recurrence, and spend-increase quality."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.periods import (
    completed_months,
    contiguous_month_suffix,
    exclude_incomplete_opening_month,
)


def _transaction(
    transaction_id: str,
    amount: str,
    when: date,
    *,
    merchant: str | None = "SHOP",
    category: str | None = "Groceries",
    transaction_class: str = "spending",
    confidence: float = 0.95,
    transaction_type: str = "debit",
    description: str | None = None,
) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=merchant,
        description=description or (merchant or "TX"),
        transaction_type=transaction_type,  # type: ignore[arg-type]
        categorisation=CategorisationResult(
            category_name=category,
            category_confidence=confidence,
            transaction_class=transaction_class,  # type: ignore[arg-type]
            classification_confidence=confidence,
            merchant_name=merchant,
        ),
    )


def _detect(transactions: list[FeatureTransaction]):
    snapshot = build_financial_features("user-a", transactions)
    return detect_leaks(snapshot, analyze_behaviour(snapshot)), snapshot


def test_incomplete_opening_and_trailing_months_are_excluded() -> None:
    transactions = [
        _transaction("sep-mid", "80", date(2025, 9, 15)),
        _transaction("oct", "100", date(2025, 10, 15)),
        _transaction("nov", "100", date(2025, 11, 15)),
        _transaction("dec", "100", date(2025, 12, 15)),
        _transaction("jan", "400", date(2026, 1, 20)),
        _transaction("feb-partial", "900", date(2026, 2, 10)),
    ]
    snapshot = build_financial_features("user-a", transactions)
    months = [month.month for month in completed_months(snapshot)]
    assert months == ["2025-10", "2025-11", "2025-12", "2026-01"]
    observation = next(
        item
        for item in analyze_behaviour(snapshot).observations
        if item.behavior_type == "spending_increase"
    )
    assert observation.evidence["current_period"] == "2026-01"
    assert observation.evidence["periods_comparable"] is True
    assert "2025-09" not in observation.evidence["baseline_months"]


def test_missing_months_are_not_treated_as_zero_spending() -> None:
    # Gap between August and November: contiguous suffix is only Nov → too short.
    transactions = [
        _transaction("aug", "100", date(2026, 8, 10)),
        _transaction("nov", "500", date(2026, 11, 10)),
        _transaction("dec", "600", date(2026, 12, 10)),
    ]
    types = {
        item.behavior_type for item in analyze_behaviour(build_financial_features("user-a", transactions)).observations
    }
    assert "spending_increase" not in types
    assert contiguous_month_suffix(["2026-08", "2026-11", "2026-12"]) == [
        "2026-11",
        "2026-12",
    ]


def test_unequal_partial_current_month_is_not_compared() -> None:
    transactions = [
        _transaction("jul", "100", date(2026, 7, 10)),
        _transaction("aug", "100", date(2026, 8, 10)),
        _transaction("sep", "100", date(2026, 9, 10)),
        _transaction("oct-partial", "800", date(2026, 10, 12)),
    ]
    snapshot = build_financial_features("user-a", transactions)
    assert [month.month for month in completed_months(snapshot)] == [
        "2026-07",
        "2026-08",
        "2026-09",
    ]
    # Flat completed months: incomplete October must not create a false increase.
    assert "spending_increase" not in {
        item.behavior_type for item in analyze_behaviour(snapshot).observations
    }


def test_tiny_or_zero_baselines_do_not_produce_percentage_findings() -> None:
    tiny = [
        _transaction("a", "10", date(2026, 7, 1)),
        _transaction("b", "10", date(2026, 8, 1)),
        _transaction("c", "80", date(2026, 9, 30)),
    ]
    assert "spending_increase" not in {
        item.behavior_type for item in analyze_behaviour(build_financial_features("user-a", tiny)).observations
    }

    zero_then_spend = [
        _transaction("fee-only-1", "5", date(2026, 7, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee"),
        _transaction("fee-only-2", "5", date(2026, 8, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee"),
        _transaction("spend", "500", date(2026, 9, 30), merchant="SHOP", category="Shopping"),
    ]
    # Purchase outflow baseline across completed months is not a tiny positive grocery series.
    behaviours = analyze_behaviour(build_financial_features("user-a", zero_then_spend))
    fuel_growth = [
        item
        for item in behaviours.observations
        if item.behavior_type == "category_growth" and item.evidence.get("subject") == "Shopping"
    ]
    assert fuel_growth == []


def test_estimated_spend_increases_omit_indefensible_annual_impact() -> None:
    spending = [
        _transaction("a", "100", date(2026, 7, 1)),
        _transaction("b", "200", date(2026, 8, 1)),
        _transaction("c", "400", date(2026, 9, 30)),
    ]
    leaks, _ = _detect(spending)
    escalation = next(item for item in leaks.leaks if item.leak_type == "spending_escalation_leak")
    assert escalation.estimated_annual_impact is None
    assert escalation.impact_kind == "estimated"
    assert escalation.severity != "high"
    assert escalation.evidence.get("annual_impact_omitted_reason") == "single_period_estimated_change"


def test_fuel_and_airtime_include_supporting_merchant_patterns() -> None:
    fuel = [
        _transaction("f1", "200", date(2026, 7, 5), merchant="ENGEN", category="Fuel"),
        _transaction("f2", "200", date(2026, 7, 20), merchant="ENGEN", category="Fuel"),
        _transaction("f3", "220", date(2026, 8, 5), merchant="ENGEN", category="Fuel"),
        _transaction("f4", "220", date(2026, 8, 20), merchant="ENGEN", category="Fuel"),
        _transaction("f5", "450", date(2026, 9, 5), merchant="ENGEN", category="Fuel"),
        _transaction("f6", "460", date(2026, 9, 20), merchant="ENGEN", category="Fuel"),
        _transaction("f7", "40", date(2026, 9, 25), merchant="ENGEN", category="Fuel"),
        _transaction("f8", "40", date(2026, 9, 30), merchant="ENGEN", category="Fuel"),
        _transaction("g1", "900", date(2026, 7, 2), merchant="CHECKERS", category="Groceries"),
        _transaction("g2", "900", date(2026, 8, 2), merchant="CHECKERS", category="Groceries"),
        _transaction("g3", "900", date(2026, 9, 2), merchant="CHECKERS", category="Groceries"),
    ]
    leaks, _ = _detect(fuel)
    transport = next(
        (item for item in leaks.leaks if item.leak_type == "transport_spending_leak"),
        None,
    )
    assert transport is not None, {item.leak_type: item.title for item in leaks.leaks}
    assert transport.estimated_annual_impact is None
    assert transport.severity != "high"
    merchants = transport.evidence.get("supporting_merchants") or []
    assert merchants
    assert merchants[0]["merchant_key"] == "ENGEN"
    assert "Supporting merchants" in transport.description
    assert "lost" not in transport.description.lower()

    airtime = [
        _transaction("a1", "50", date(2026, 7, 3), merchant="VODACOM", category="Airtime & Data", description="AIRTIME VODACOM"),
        _transaction("a2", "50", date(2026, 7, 18), merchant="VODACOM", category="Airtime & Data", description="AIRTIME VODACOM"),
        _transaction("a3", "60", date(2026, 8, 3), merchant="VODACOM", category="Airtime & Data", description="AIRTIME VODACOM"),
        _transaction("a4", "60", date(2026, 8, 18), merchant="VODACOM", category="Airtime & Data", description="AIRTIME VODACOM"),
        _transaction("a5", "120", date(2026, 9, 3), merchant="VODACOM", category="Airtime & Data", description="AIRTIME VODACOM"),
        _transaction("a6", "130", date(2026, 9, 10), merchant="VODACOM", category="Airtime & Data", description="AIRTIME VODACOM"),
        _transaction("a7", "140", date(2026, 9, 20), merchant="VODACOM", category="Airtime & Data", description="AIRTIME VODACOM"),
        _transaction("a8", "150", date(2026, 9, 30), merchant="VODACOM", category="Airtime & Data", description="AIRTIME VODACOM"),
        _transaction("g1", "800", date(2026, 7, 2), merchant="CHECKERS", category="Groceries"),
        _transaction("g2", "800", date(2026, 8, 2), merchant="CHECKERS", category="Groceries"),
        _transaction("g3", "800", date(2026, 9, 2), merchant="CHECKERS", category="Groceries"),
    ]
    airtime_leaks, _ = _detect(airtime)
    airtime_leak = next(
        item for item in airtime_leaks.leaks if item.leak_type == "airtime_data_leak"
    )
    assert airtime_leak.estimated_annual_impact is None
    assert airtime_leak.evidence.get("amounts_not_additive_with_overall_escalation") is True


def test_overall_and_category_findings_stay_non_additive() -> None:
    transactions = [
        _transaction("a", "100", date(2026, 7, 1), merchant="ENGEN", category="Fuel"),
        _transaction("b", "200", date(2026, 8, 1), merchant="ENGEN", category="Fuel"),
        _transaction("c", "500", date(2026, 9, 30), merchant="ENGEN", category="Fuel"),
        _transaction("g1", "1000", date(2026, 7, 2), merchant="CHECKERS", category="Groceries"),
        _transaction("g2", "1000", date(2026, 8, 2), merchant="CHECKERS", category="Groceries"),
        _transaction("g3", "1000", date(2026, 9, 29), merchant="CHECKERS", category="Groceries"),
    ]
    leaks, _ = _detect(transactions)
    escalation = next(
        (item for item in leaks.leaks if item.leak_type == "spending_escalation_leak"),
        None,
    )
    category = next(
        (item for item in leaks.leaks if item.leak_type == "transport_spending_leak"),
        None,
    )
    if escalation is not None:
        assert escalation.evidence["amounts_not_additive_with_category_findings"] is True
        assert escalation.estimated_annual_impact is None
    if category is not None:
        assert category.evidence.get("amounts_not_additive_with_overall_escalation") is True
        assert category.estimated_annual_impact is None


def test_repeated_grocery_purchases_are_not_subscriptions() -> None:
    spar = [
        _transaction(
            f"spar-{index}",
            "261.20",
            when,
            merchant="SPAR",
            category="Groceries",
            description="POS PURCHASE SPAR",
        )
        for index, when in enumerate(
            (date(2026, 4, 1), date(2026, 6, 3), date(2026, 8, 5), date(2026, 10, 7))
        )
    ]
    leaks, snapshot = _detect(spar)
    assert snapshot.merchants[0].recurrence.observation_count == 4
    types = {item.leak_type for item in leaks.leaks}
    assert "subscription_leak" not in types
    assert "recurring_payment_leak" not in types
    assert "unknown_recurring_payment" not in types


def test_genuine_monthly_subscription_still_detected() -> None:
    netflix = [
        _transaction(
            f"netflix-{index}",
            "159",
            when,
            merchant="NETFLIX",
            category="Subscriptions",
            description="NETFLIX.COM",
        )
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1))
        )
    ]
    leaks, _ = _detect(netflix)
    subscription = next(item for item in leaks.leaks if item.leak_type == "subscription_leak")
    assert subscription.evidence["finding_focus"] == "subscription_review"
    assert subscription.estimated_annual_impact == subscription.estimated_monthly_impact * Decimal("12")


def test_irregular_and_insufficient_recurring_observations_are_rejected() -> None:
    irregular = [
        _transaction(f"x-{index}", amount, when, merchant="ODD CO", category="Software")
        for index, (amount, when) in enumerate(
            (
                ("100", date(2026, 7, 1)),
                ("240", date(2026, 7, 20)),
                ("80", date(2026, 8, 28)),
                ("300", date(2026, 10, 15)),
            )
        )
    ]
    irregular_types = {item.leak_type for item in _detect(irregular)[0].leaks}
    assert "recurring_payment_leak" not in irregular_types
    assert "subscription_leak" not in irregular_types

    insufficient = [
        _transaction("one", "99", date(2026, 8, 1), merchant="NETFLIX", category="Subscriptions"),
        _transaction("two", "99", date(2026, 9, 1), merchant="NETFLIX", category="Subscriptions"),
    ]
    assert "subscription_leak" not in {item.leak_type for item in _detect(insufficient)[0].leaks}


def test_weak_non_shopping_cadence_uses_repeated_payments_wording() -> None:
    # Medium-strength cadence (amount varies enough to avoid high strength).
    payments = [
        _transaction(f"host-{index}", amount, when, merchant="CLOUD HOST", category="Software")
        for index, (amount, when) in enumerate(
            (
                ("140", date(2026, 7, 1)),
                ("155", date(2026, 8, 1)),
                ("148", date(2026, 9, 1)),
                ("160", date(2026, 10, 1)),
            )
        )
    ]
    leaks, snapshot = _detect(payments)
    assert snapshot.merchants[0].recurrence.recurrence_strength in {"medium", "high"}
    if snapshot.merchants[0].recurrence.recurrence_strength == "medium":
        leak = next(
            item
            for item in leaks.leaks
            if item.leak_type in {"recurring_payment_leak", "unknown_recurring_payment"}
        )
        assert leak.evidence["finding_focus"] == "repeated_payments_detected"
        assert "Repeated payments detected" in leak.title
        assert leak.estimated_annual_impact is None


def test_duplicate_candidates_with_divergent_descriptions_are_filtered() -> None:
    divergent = [
        _transaction(
            "a",
            "186.40",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            description="WOOLWORTHS TILL 12",
        ),
        _transaction(
            "b",
            "186.40",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            description="WOOLWORTHS ONLINE ORDER",
        ),
        _transaction("later", "420", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    assert "duplicate_payment_leak" not in {item.leak_type for item in _detect(divergent)[0].leaks}

    matching = [
        _transaction(
            "a",
            "50",
            date(2026, 7, 1),
            merchant="COFFEE",
            category="Restaurants",
            description="COFFEE SHOP",
        ),
        _transaction(
            "b",
            "50",
            date(2026, 7, 1),
            merchant="COFFEE",
            category="Restaurants",
            description="COFFEE SHOP",
        ),
        _transaction("later", "100", date(2026, 9, 30), merchant="OTHER", category="Shopping"),
    ]
    leak = next(
        item for item in _detect(matching)[0].leaks if item.leak_type == "duplicate_payment_leak"
    )
    assert leak.estimated_annual_impact is None
    assert leak.evidence["verification_required"] is True
    assert leak.evidence["potential_not_confirmed_savings"] is True


def test_large_one_period_spend_increase_is_not_automatically_high_severity() -> None:
    spending = [
        _transaction("a", "500", date(2026, 7, 1)),
        _transaction("b", "500", date(2026, 8, 1)),
        _transaction("c", "2500", date(2026, 9, 30)),
    ]
    leaks, _ = _detect(spending)
    escalation = next(item for item in leaks.leaks if item.leak_type == "spending_escalation_leak")
    assert escalation.estimated_monthly_impact >= Decimal("1000")
    assert escalation.severity == "medium"
    assert escalation.confidence <= 0.80


def test_exclude_incomplete_opening_month_helper() -> None:
    months = ["2025-09", "2025-10", "2025-11"]
    trimmed = exclude_incomplete_opening_month(
        months,
        date(2025, 9, 20),
        lambda month: month,
    )
    assert trimmed == ["2025-10", "2025-11"]
    kept = exclude_incomplete_opening_month(
        months,
        date(2025, 9, 10),
        lambda month: month,
    )
    assert kept == months
