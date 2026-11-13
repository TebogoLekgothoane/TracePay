import json

import pytest

from app.config import Settings
from leak_intelligence import subscription_llm
from leak_intelligence.subscription_detection import detect_subscriptions
from tests.test_subscription_gotyme_regression import SPOTIFY, STATEMENT, tx


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(subscription_llm.settings, "subscription_llm_enabled", True)
    monkeypatch.setattr(subscription_llm.settings, "subscription_llm_model", "pinned/model-1")
    monkeypatch.setattr(subscription_llm.settings, "openrouter_api_key", "test-key")
    monkeypatch.setattr(subscription_llm, "_cache", {})
    calls: list[str] = []

    def fake_request(prompt, schema, name):
        calls.append(prompt)
        if name == "merchant_labels":
            inputs = json.loads(prompt[prompt.index("{"):])["inputs"]
            return {"merchants": [
                {"input": value, "canonical_name": "streamco", "display_name": "StreamCo"} if "STREAMCO" in value
                else {"input": value, "canonical_name": "Not Valid!", "display_name": "x"}
                for value in inputs
            ]}
        return {"reason": "Charged every month at the same amount."}

    monkeypatch.setattr(subscription_llm, "_request", fake_request)
    return calls


def test_feature_is_off_by_default():
    defaults = Settings(_env_file=None)
    assert defaults.subscription_llm_enabled is False
    assert defaults.subscription_llm_model == ""


def test_disabled_layer_is_a_no_op(monkeypatch):
    monkeypatch.setattr(subscription_llm.settings, "subscription_llm_enabled", False)
    assert subscription_llm.merchant_resolver() is None
    groups = detect_subscriptions(STATEMENT)
    assert subscription_llm.label_subscription_groups(groups) == groups


def test_enabled_without_pinned_model_stays_off(monkeypatch):
    monkeypatch.setattr(subscription_llm.settings, "subscription_llm_enabled", True)
    monkeypatch.setattr(subscription_llm.settings, "subscription_llm_model", "")
    assert subscription_llm.merchant_resolver() is None


def test_resolver_sends_only_normalised_strings_validates_and_caches(enabled):
    rows = [
        tx("m-1", "2026-07-10", "Int Recurring Payment from STREAMCO PREMIUM +27821234567 Ref 99887766", "99.00"),
        tx("m-2", "2026-08-10", "Int Recurring Payment from STREAMCO PREMIUM +27821234567 Ref 99887755", "99.00"),
        tx("m-3", "2026-08-11", "Int Recurring Payment from ODDCO", "10.00"),
        tx("p-1", "2026-08-12", "Payment to Jane Person", "500.00", category="Transfers"),
    ] + SPOTIFY
    resolver = subscription_llm.merchant_resolver()
    result = detect_subscriptions(rows, merchant_resolver=resolver)
    assert len(enabled) == 1
    sent = enabled[0]
    assert '"inputs": ["ODDCO", "STREAMCO PREMIUM"]' in sent
    for secret in ("27821234567", "99887766", "JANE", "Jane", "500", "99.00"):
        assert secret not in sent
    group = next(item for item in result if item.canonical_name == "streamco")
    assert group.merchant_name == "StreamCo"
    assert (group.ai_model, group.ai_prompt_version) == ("pinned/model-1", subscription_llm.PROMPT_VERSION)
    # The invalid label for ODDCO is rejected; the deterministic name stays.
    assert all(item.canonical_name != "Not Valid!" for item in result)
    # Second run is served from the cache.
    assert detect_subscriptions(rows, merchant_resolver=resolver) == result
    assert len(enabled) == 1


def test_reason_label_never_changes_detected_values(enabled):
    groups = detect_subscriptions(STATEMENT)
    labelled = subscription_llm.label_subscription_groups(groups)
    for before, after in zip(groups, labelled):
        assert after.ai_reason == "Charged every month at the same amount."
        assert after.ai_model == "pinned/model-1"
        assert after.model_dump(exclude={"ai_reason", "ai_model", "ai_prompt_version"}) == before.model_dump(
            exclude={"ai_reason", "ai_model", "ai_prompt_version"}
        )
    assert "BALANCE" not in " ".join(enabled).upper()


def test_failed_request_falls_back(monkeypatch, enabled):
    monkeypatch.setattr(subscription_llm, "_request", lambda *_args: None)
    groups = detect_subscriptions(STATEMENT, merchant_resolver=subscription_llm.merchant_resolver())
    assert groups == detect_subscriptions(STATEMENT)
    assert subscription_llm.label_subscription_groups(groups) == groups
