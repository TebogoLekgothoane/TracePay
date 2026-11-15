import json

from leak_intelligence import ai_counteract


def test_plan_carries_prevention_and_saving():
    plan = ai_counteract.parse_plan(
        json.dumps(
            {
                "summary": "Cut the SMS fees.",
                "potential_saving": "Up to R30 a month.",
                "actions": [{"title": "Check fees", "detail": "Open your statement."}],
                "prevent": [
                    {"title": "Turn off SMS notifications", "detail": "Use push notifications instead."}
                ],
            }
        )
    )
    assert plan is not None
    assert plan.prevent[0][0] == "Turn off SMS notifications"
    payload = plan.payload()
    assert payload["potential_saving"] == "Up to R30 a month."
    assert payload["prevent"][0]["title"] == "Turn off SMS notifications"


def test_fee_fallback_tells_the_customer_to_switch_off_sms_alerts():
    plan = ai_counteract.fallback_plan("bank_fee_leak")
    assert plan.prevent
    assert any("SMS" in title for title, _ in plan.prevent)
    for leak_type in ("duplicate_payment_leak", "subscription_leak", "food_spending_leak", "new_leak"):
        assert ai_counteract.fallback_plan(leak_type).prevent
