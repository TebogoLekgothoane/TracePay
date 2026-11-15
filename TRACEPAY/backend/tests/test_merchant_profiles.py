from decimal import Decimal

import pytest

from categorisation import merchant_profiles as profiles
from categorisation.models import CategorisationResult


class _Settings:
    ai_categorisation_enabled = True
    supabase_url = ""
    supabase_service_role_key = ""
    merchant_directory_enabled = False

    @staticmethod
    def categorisation_provider_keys():
        return (True, False, False)


@pytest.fixture(autouse=True)
def _isolated(monkeypatch):
    profiles._known.clear()
    monkeypatch.setattr(profiles, "settings", _Settings())


def _ref(name):
    return f"Capitec Pay Payment: {name} (79249833)"


def test_payee_label_only_picks_business_shaped_payees():
    unresolved = {"transaction_class": "person_to_person", "category_name": "Transfers"}
    assert profiles.payee_label(_ref("Acmebroker"), **unresolved) == "Acmebroker"
    assert profiles.payee_label(_ref("Blue Harbour Markets"), **unresolved) == "Blue Harbour Markets"
    assert profiles.payee_label("Online purchase: zorbo.com", transaction_class="unknown") == "zorbo"
    assert profiles.payee_label("Payment to Zorbo Trading (Pty) Ltd", transaction_class="unknown")
    # A person, bank wording and a row the rules already categorised are never sent out.
    assert profiles.payee_label("Immediate Payment: Jane Smith", **unresolved) is None
    assert profiles.payee_label("Monthly account fee", transaction_class="unknown") is None
    assert (
        profiles.payee_label(_ref("Acmebroker"), transaction_class="spending", category_name="Groceries")
        is None
    )


def test_unknown_payee_is_identified_once_and_reused(monkeypatch):
    calls = []

    def fake(names):
        calls.append(list(names))
        return {
            "merchants": [
                {"name": "Acmebroker", "business_type": "trading_broker", "what_they_do": "x", "confidence": 0.95},
                {"name": "Zorbo", "business_type": "retailer", "what_they_do": "x", "confidence": 0.9},
                {"name": "Vague", "business_type": "gambling", "what_they_do": "x", "confidence": 0.4},
            ]
        }

    monkeypatch.setattr(profiles, "_ask_model", fake)
    names = ["Acmebroker", "Zorbo", "Vague", "Acmebroker"]
    types = profiles.resolve_payee_types(names, lambda amount: True)
    assert types == {"acmebroker": "trading_broker", "zorbo": "retailer", "vague": "unknown"}
    assert calls == [["Acmebroker", "Zorbo", "Vague"]]
    profiles.resolve_payee_types(names, lambda amount: True)
    assert len(calls) == 1  # remembered, nothing asked again


def test_no_budget_or_failure_changes_nothing(monkeypatch):
    monkeypatch.setattr(profiles, "_ask_model", lambda names: pytest.fail("must not call the model"))
    assert profiles.resolve_payee_types(["Acmebroker"], lambda amount: False) == {}


def test_categoriser_reclassifies_unresolved_payee(monkeypatch):
    monkeypatch.setattr(
        profiles,
        "_ask_model",
        lambda names: {
            "merchants": [
                {"name": n, "business_type": "trading_broker", "what_they_do": "x", "confidence": 0.9}
                for n in names
            ]
        },
    )
    p2p = CategorisationResult(
        category_name="Transfers",
        category_confidence=0.6,
        transaction_class="person_to_person",
        classification_confidence=0.6,
        classification_reason="bank wording",
        rule="identity:person_to_person",
    )
    results = {"1": p2p, "2": p2p.model_copy()}
    rows = [("1", _ref("Acmebroker"), "debit"), ("2", "Immediate Payment: Jane Smith", "debit")]
    changed = profiles.apply_profiles(rows, results, {"Other", "Transfers"}, lambda amount: True)
    assert changed == 1
    assert results["1"].transaction_class == "investment"
    assert results["1"].merchant_name == "Acmebroker"
    assert results["2"].transaction_class == "person_to_person"


def test_leak_review_flags_ai_identified_broker():
    from leak_intelligence.statement_review import _platform_payee

    profiles._known.update({'acmebroker': 'trading_broker', 'zorbo': 'retailer'})
    assert _platform_payee(_ref('Acmebroker')) == ('Acmebroker', True)
    assert _platform_payee(_ref('Zorbo')) is None



def test_unlisted_online_lender_is_identified_and_counted_as_high_cost(monkeypatch):
    from leak_intelligence.commitment_groups import credit_provider

    monkeypatch.setattr(
        profiles,
        "_ask_model",
        lambda names: {
            "merchants": [
                {"name": n, "business_type": "short_term_lender", "what_they_do": "x", "confidence": 0.9}
                for n in names
            ]
        },
    )
    base = CategorisationResult(
        category_name="Other",
        category_confidence=0.4,
        transaction_class="spending",
        classification_confidence=0.4,
        classification_reason="x",
        rule="fallback:other",
    )
    p2p = base.model_copy(update={"transaction_class": "person_to_person", "category_name": "Transfers"})
    results = {"1": p2p, "2": base}
    rows = [("1", _ref("Quickcashco"), "debit"), ("2", "Debit order Zorbo Loans", "debit")]
    assert profiles.apply_profiles(rows, results, {"Other", "Loans & Credit"}, lambda a: True) == 2
    assert results["1"].category_name == "Loans & Credit"
    assert results["2"].category_name == "Loans & Credit"
    assert credit_provider("Quickcashco") == ("QUICKCASHCO", True)
