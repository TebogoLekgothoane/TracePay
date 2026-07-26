from __future__ import annotations

from datetime import datetime, timezone

from app.leak_lifecycle import detect_fi_004, detect_fi_015, detect_fi_027


def _transaction(
    transaction_id: str,
    timestamp: datetime,
    amount: float,
    *,
    category: str = "other",
    description: str = "",
    merchant: str | None = None,
    meta: dict | None = None,
) -> dict:
    return {
        "transaction_id": transaction_id,
        "timestamp": timestamp,
        "amount": amount,
        "direction": "debit",
        "category": category,
        "description": description,
        "merchant": merchant,
        "counterparty": None,
        "transaction_data": meta or {},
    }


def test_fi_004_requires_recorded_atm_fees() -> None:
    transactions = [
        _transaction(
            f"atm-{index}",
            datetime(2026, 6, index + 1, tzinfo=timezone.utc),
            100,
            category="atm",
            meta={"bank": "Trace Bank"},
        )
        for index in range(4)
    ]
    assert detect_fi_004(transactions) == []

    for transaction in transactions:
        transaction["transaction_data"]["fee_amount"] = 8.5
    findings = detect_fi_004(transactions)

    assert len(findings) == 1
    assert findings[0].amount_monthly == 34
    assert "R34.00" in findings[0].exact_action


def test_fi_015_requires_complete_six_month_comparison() -> None:
    transactions = []
    months = [
        (2025, 6),
        (2025, 7),
        (2025, 8),
        (2025, 9),
        (2025, 10),
        (2025, 11),
        (2025, 12),
        (2026, 1),
        (2026, 2),
        (2026, 3),
        (2026, 4),
        (2026, 5),
        (2026, 6),
    ]
    for index, (year, month) in enumerate(months):
        transactions.append(
            _transaction(
                f"fee-{index}",
                datetime(year, month, 1, tzinfo=timezone.utc),
                100 if index < 6 else 120,
                description="Monthly banking fee",
                meta={"bank": "Trace Bank", "fee_type": "banking"},
            )
        )

    findings = detect_fi_015(transactions)
    assert len(findings) == 1
    assert findings[0].evidence["pct_increase"] == 20


def test_fi_027_requires_merchant_for_specific_action() -> None:
    missing_merchant = _transaction(
        "failed-1",
        datetime(2026, 6, 1, tzinfo=timezone.utc),
        35,
        description="Failed debit order fee",
    )
    assert detect_fi_027([missing_merchant]) == []

    finding = detect_fi_027(
        [
            _transaction(
                "failed-2",
                datetime(2026, 6, 1, tzinfo=timezone.utc),
                35,
                description="Failed debit order fee",
                merchant="Insurer",
            )
        ]
    )[0]
    assert "R35.00" in finding.exact_action
    assert "Insurer" in finding.exact_action
