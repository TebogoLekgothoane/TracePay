from types import SimpleNamespace

from leak_intelligence import ai_counteract


def _leak(**over):
    base = dict(
        title="Acme subscription",
        description="Paid monthly",
        leak_type="subscription_leak",
        estimated_monthly_impact=199,
        supporting_transaction_count=3,
        claims=SimpleNamespace(confirmed=[SimpleNamespace(text="Charged 3 months in a row")]),
        supporting_transactions=[SimpleNamespace(description="CARD 1234567890 ACME", amount=199)],
    )
    base.update(over)
    return SimpleNamespace(**base)


def test_facts_hold_only_the_findings_own_summary():
    facts = ai_counteract.leak_facts(_leak())
    assert facts["monthly_cost_rand"] == 199.0
    assert facts["confirmed_facts"] == ["Charged 3 months in a row"]
    assert "supporting_transactions" not in facts
    assert "1234567890" not in str(facts)


def test_fallback_steps_exist_for_every_family():
    for leak_type in ("duplicate_payment_leak", "subscription_leak", "bank_fee_leak",
                      "food_spending_leak", "something_new_leak"):
        actions = ai_counteract.fallback_actions(leak_type)
        assert len(actions) >= 2 and all(title and detail for title, detail in actions)
