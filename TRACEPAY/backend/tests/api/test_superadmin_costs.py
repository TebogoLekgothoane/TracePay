from datetime import datetime, timedelta, timezone

from app.sms_usage import message_parts
from app.superadmin_metrics import Snapshot, build_metrics

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)


def _iso(delta: timedelta) -> str:
    return (NOW - delta).isoformat()


def _build(**overrides) -> dict:
    snapshot = Snapshot(
        purchases=[
            {"user_id": "u1", "product": "full_analysis", "status": "succeeded", "amount_cents": 11500, "paid_at": _iso(timedelta(hours=1)), "created_at": _iso(timedelta(hours=1))},
        ],
        sms_events=[
            {"outcome": "sent", "parts": 1, "created_at": _iso(timedelta(hours=2))},
            {"outcome": "sent", "parts": 2, "created_at": _iso(timedelta(days=1))},
            {"outcome": "failed", "parts": 0, "created_at": _iso(timedelta(days=1))},
            {"outcome": "sent", "parts": 1, "created_at": _iso(timedelta(days=90))},
        ],
    )
    return build_metrics(
        snapshot, days=30, now=NOW, full_price_cents=4900, monitoring_price_cents=29900, **overrides
    )["costs"]


def test_sms_counts_only_the_range_and_bills_sent_parts():
    sms = _build(sms_cost_zar_per_part=0.5)["sms"]
    assert (sms["sent"], sms["failed"], sms["parts"]) == (2, 1, 3)
    assert sms["cost_zar"] == 1.5
    assert sms["failure_rate"] == round(1 / 3, 4)


def test_margin_strips_vat_then_fees_then_costs():
    margin = _build(sms_cost_zar_per_part=0.5)["margin"]
    # R115 incl 15% VAT is R100 ex VAT; 15% store + 1% RevenueCat leaves R84.
    assert margin["gross_zar"] == 115.0
    assert margin["vat_zar"] == 15.0
    assert margin["net_revenue_zar"] == 84.0
    assert margin["variable_cost_zar"] == 1.5
    assert margin["margin_zar"] == 82.5
    assert margin["margin_pct"] == round(100 * 82.5 / 84, 1)
    assert margin["fixed_cost_zar"] is None and margin["result_zar"] is None


def test_fixed_cost_is_prorated_when_configured():
    margin = _build(sms_cost_zar_per_part=0.5, fixed_monthly_cost_zar=3650)["margin"]
    assert margin["fixed_cost_zar"] == 3600.0  # 3650 * 12 / 365 * 30 days
    assert margin["result_zar"] == round(82.5 - 3600.0, 2)


def test_missing_sms_table_is_reported_not_fatal():
    snapshot = Snapshot(missing_tables=["sms_usage_events"])
    costs = build_metrics(snapshot, days=7, now=NOW, full_price_cents=4900, monitoring_price_cents=29900)["costs"]
    assert costs["sms"]["logging_ready"] is False
    assert costs["margin"]["margin_pct"] is None


def test_message_parts():
    assert message_parts("TracePay sign-in: 123456") == 1
    assert message_parts("a" * 160) == 1
    assert message_parts("a" * 161) == 2
    assert message_parts("é" * 71) == 2


def test_break_even_uses_contribution_per_sale():
    unit = _build(sms_cost_zar_per_part=0.5, fixed_monthly_cost_zar=840)["unit"]
    # One sale: net R84, variable cost R1.50, so R82.50 contribution; R840 fixed needs 10.2 sales a month.
    assert unit["net_per_sale_zar"] == 84.0
    assert unit["contribution_per_sale_zar"] == 82.5
    assert unit["break_even_sales_per_month"] == 10.2
    assert unit["ai_per_statement_zar"] is None  # no processed statements in this fixture


def test_break_even_is_none_without_sales_or_fixed_cost():
    assert _build()["unit"]["break_even_sales_per_month"] is None
