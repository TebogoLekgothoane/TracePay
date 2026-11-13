"""P5 free-trial conversion and P6 unidentified recurring payee findings."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.payee_candidates import unidentified_signature
from tests.test_leak_detection import _detect, _transaction

ANCHOR = _transaction("anchor", "40", date(2026, 10, 20), merchant="CHECKERS", category="Groceries")


def _types(transactions):
    return _detect([*transactions, ANCHOR]).leaks


def _trial_leak(transactions):
    return next(
        (item for item in _types(transactions) if item.evidence.get("finding_focus") == "trial_conversion"),
        None,
    )


def _sub(tx_id, amount, when, merchant="SHOWMAX", description=None, category="Subscriptions"):
    return _transaction(
        tx_id, amount, when, merchant=merchant, category=category, description=description or merchant
    )


# ------------------------------------------------------------------ P5 positives
def test_zero_value_record_then_stable_paid_charges_is_a_likely_conversion() -> None:
    rows = [
        _sub("t0", "0", date(2026, 7, 5)),
        _sub("p1", "99", date(2026, 8, 5)),
        _sub("p2", "99", date(2026, 9, 5)),
        _sub("p3", "99", date(2026, 10, 5)),
    ]
    leak = _trial_leak(rows)
    assert leak is not None
    evidence = leak.evidence
    assert evidence["finding_kind"] == "verification_required"
    assert evidence["trial_evidence"] == "zero_value_record"
    assert evidence["trial_dates"] == ["2026-07-05"]
    assert evidence["first_paid_date"] == "2026-08-05"
    assert evidence["days_from_trial_to_first_paid"] == 31
    assert evidence["paid_payment_count"] == 3
    assert evidence["observed_total_paid"] == Decimal("297")
    assert evidence["evidence_status"] == "likely"
    assert "free trial" in evidence["verification_prompt"].lower()
    assert leak.estimated_annual_impact is None  # nothing is projected


def test_trial_wording_alone_with_one_paid_charge_is_only_possible() -> None:
    rows = [
        _sub("t0", "0", date(2026, 9, 1), description="SHOWMAX FREE TRIAL"),
        _sub("p1", "99", date(2026, 10, 1)),
    ]
    leak = _trial_leak(rows)
    assert leak is not None
    assert leak.evidence["evidence_status"] == "possible"
    assert leak.evidence["paid_payment_count"] == 1


def test_a_token_charge_labelled_trial_counts_as_the_trial_record() -> None:
    rows = [
        _sub("t0", "1", date(2026, 7, 5), description="DISNEY PLUS TRIAL", merchant="DISNEY PLUS"),
        _sub("p1", "129", date(2026, 8, 5), merchant="DISNEY PLUS"),
        _sub("p2", "129", date(2026, 9, 5), merchant="DISNEY PLUS"),
    ]
    leak = _trial_leak(rows)
    assert leak is not None
    assert leak.evidence["trial_evidence"] == "trial_wording"


def test_trial_record_is_not_counted_as_a_payment_in_subscription_features() -> None:
    rows = [
        _sub("t0", "0", date(2026, 7, 5)),
        _sub("p1", "99", date(2026, 8, 5)),
        _sub("p2", "99", date(2026, 9, 5)),
        _sub("p3", "99", date(2026, 10, 5)),
    ]
    merchant = build_financial_features("user-a", rows).merchants[0]
    assert merchant.merchant_transaction_count == 3
    assert merchant.recurrence.typical_amount == Decimal("99")


# ------------------------------------------------------------------ P5 negatives
def test_new_subscription_without_a_trial_record_is_not_a_conversion() -> None:
    rows = [_sub(f"p{i}", "99", date(2026, 7 + i, 5)) for i in range(4)]
    assert _trial_leak(rows) is None
    assert not any("trial" in str(item.evidence) .lower() for item in _types(rows))


def test_paying_before_the_trial_is_a_returning_customer() -> None:
    rows = [
        _sub("p0", "99", date(2026, 5, 5)),
        _sub("t0", "0", date(2026, 7, 5)),
        _sub("p1", "99", date(2026, 8, 5)),
        _sub("p2", "99", date(2026, 9, 5)),
    ]
    assert _trial_leak(rows) is None


def test_a_trial_that_never_became_paid_is_not_reported() -> None:
    assert _trial_leak([_sub("t0", "0", date(2026, 7, 5))]) is None


def test_paid_charge_months_after_the_trial_is_not_a_conversion() -> None:
    rows = [_sub("t0", "0", date(2026, 3, 1)), _sub("p1", "99", date(2026, 9, 1)), _sub("p2", "99", date(2026, 10, 1))]
    assert _trial_leak(rows) is None


def test_refund_or_credit_zero_rows_are_not_trials() -> None:
    rows = [
        _transaction("c0", "0", date(2026, 7, 5), merchant="SHOWMAX", category="Subscriptions", transaction_type="credit"),
        _sub("p1", "99", date(2026, 8, 5)),
        _sub("p2", "99", date(2026, 9, 5)),
    ]
    assert _trial_leak(rows) is None


# ------------------------------------------------------------------ P6
def _unknown(tx_id, amount, when, description="ZXQ HOLDINGS 4482"):
    return _transaction(
        tx_id, amount, when, merchant=None, category="Other", confidence=0.4, description=description
    )


def _monthly_unknown(count=5, amount="89", description="ZXQ HOLDINGS 4482", day=12):
    return [
        _unknown(f"u{i}", amount, date(2026, 5 + i, day), description.replace("4482", str(4400 + i)))
        for i in range(count)
    ]


def test_stable_monthly_payments_to_an_unidentified_payee_are_a_verification_finding() -> None:
    leak = next(
        item for item in _types(_monthly_unknown()) if item.leak_type == "unknown_recurring_payment"
    )
    evidence = leak.evidence
    assert leak.title == "Recurring payments to an unidentified merchant"
    assert evidence["finding_kind"] == "verification_required"
    assert evidence["finding_focus"] == "unidentified_recurring_merchant"
    assert evidence["cadence"] == "monthly"
    assert evidence["payment_count"] == 5
    assert evidence["observed_total_paid"] == Decimal("445")
    assert evidence["first_observed_date"] == date(2026, 5, 12)
    assert evidence["last_observed_date"] == date(2026, 9, 12)
    assert len(evidence["payment_dates"]) == 5
    assert evidence["merchant_key"] is None
    assert "ZXQ" not in leak.title  # no merchant identity is invented
    assert leak.estimated_annual_impact is None
    assert leak.evidence["evidence_status"] == "possible"
    assert leak.confidence <= 0.60


def test_weekly_payments_and_drifting_billing_dates_are_supported() -> None:
    weekly = [_unknown(f"w{i}", "45", date(2026, 7, 3) + timedelta(days=7 * i), "QRX CLUB") for i in range(6)]
    leaks = [i for i in _types(weekly) if i.leak_type == "unknown_recurring_payment"]
    assert leaks and leaks[0].evidence["cadence"] == "weekly"

    drifting_days = [12, 14, 11, 15, 13]
    drifting = [
        _unknown(f"d{i}", "89", date(2026, 5 + i, day), "ZXQ HOLDINGS")
        for i, day in enumerate(drifting_days)
    ]
    assert [i for i in _types(drifting) if i.leak_type == "unknown_recurring_payment"]


def test_quarterly_payments_are_supported() -> None:
    quarterly = [
        _unknown("q0", "250", date(2026, 1, 15), "KLM SERVICES"),
        _unknown("q1", "250", date(2026, 4, 15), "KLM SERVICES"),
        _unknown("q2", "250", date(2026, 7, 15), "KLM SERVICES"),
        _unknown("q3", "250", date(2026, 10, 15), "KLM SERVICES"),
    ]
    leaks = [i for i in _detect(quarterly).leaks if i.leak_type == "unknown_recurring_payment"]
    assert leaks and leaks[0].evidence["cadence"] == "quarterly"


def test_supporting_transactions_are_attached_for_the_payee() -> None:
    transactions = [*_monthly_unknown(), ANCHOR]
    detected = attach_supporting_transactions(_detect(transactions), transactions)
    leak = next(item for item in detected.leaks if item.leak_type == "unknown_recurring_payment")
    assert leak.supporting_transaction_count == 5
    assert {row.transaction_id for row in leak.supporting_transactions} == {f"u{i}" for i in range(5)}


def test_one_off_and_irregular_unknown_payments_are_not_findings() -> None:
    one_off = [_unknown("o0", "900", date(2026, 7, 3), "ZXQ HOLDINGS")]
    assert not [i for i in _types(one_off) if i.leak_type == "unknown_recurring_payment"]
    irregular = [
        _unknown(f"i{i}", "89", day, "ZXQ HOLDINGS")
        for i, day in enumerate([date(2026, 5, 2), date(2026, 5, 19), date(2026, 7, 30), date(2026, 8, 4)])
    ]
    assert not [i for i in _types(irregular) if i.leak_type == "unknown_recurring_payment"]
    varying = [
        _unknown(f"v{i}", amount, date(2026, 5 + i, 12), "ZXQ HOLDINGS")
        for i, amount in enumerate(["40", "120", "75", "300"])
    ]
    assert not [i for i in _types(varying) if i.leak_type == "unknown_recurring_payment"]


def test_transfers_cash_and_people_are_never_unidentified_payees() -> None:
    for description in ("ATM CASH WITHDRAWAL", "IB TRANSFER TO SAVINGS", "PAYSHAP PAYMENT SIPHO"):
        rows = _monthly_unknown(description=description)
        assert all(unidentified_signature(item) is None for item in rows)
    person = [
        _transaction(
            f"p{i}", "500", date(2026, 5 + i, 12), merchant=None, category="Transfers",
            transaction_class="person_to_person", description="ZXQ HOLDINGS",
        )
        for i in range(5)
    ]
    assert all(unidentified_signature(item) is None for item in person)


def test_a_description_with_no_distinctive_word_is_not_grouped() -> None:
    rows = [_unknown(f"b{i}", "89", date(2026, 5 + i, 12), "POS PURCHASE 4482XX") for i in range(5)]
    assert all(unidentified_signature(item) is None for item in rows)
    assert not [i for i in _types(rows) if i.leak_type == "unknown_recurring_payment"]


def test_an_identified_merchant_is_not_reported_as_unidentified() -> None:
    rows = [_sub(f"n{i}", "199", date(2026, 5 + i, 12), merchant="NETFLIX") for i in range(5)]
    assert all(unidentified_signature(item) is None for item in rows)
    assert not [i for i in _types(rows) if i.evidence.get("finding_focus") == "unidentified_recurring_merchant"]
