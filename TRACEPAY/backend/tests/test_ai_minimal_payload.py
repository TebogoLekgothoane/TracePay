from categorisation import ai_classifier
from categorisation.ai_classifier import AiTransaction, classify_batch
from categorisation.models import CategorisationResult


def test_model_prompt_has_no_real_ids_or_amounts(monkeypatch):
    seen = {}

    def fake_minimal(transactions, category_names):
        seen["prompt"] = ai_classifier._build_instructions(transactions, category_names)
        return {
            item.transaction_id: CategorisationResult(
                category_name="Other",
                category_confidence=0.9,
                transaction_class="spending",
                classification_confidence=0.9,
                classification_reason="x",
                rule="ai:test",
            )
            for item in transactions
        }

    monkeypatch.setattr(ai_classifier, "_classify_minimal", fake_minimal)
    batch = [
        AiTransaction("8f1c2d3e-real-uuid-1", "Card purchase Acme Store", "1234.56", "debit"),
        AiTransaction("8f1c2d3e-real-uuid-2", "Online purchase Zorbo", "99.00", "debit"),
    ]
    results = classify_batch(batch, ["Other"])
    assert set(results) == {"8f1c2d3e-real-uuid-1", "8f1c2d3e-real-uuid-2"}
    assert "real-uuid" not in seen["prompt"]
    assert "1234.56" not in seen["prompt"] and "99.00" not in seen["prompt"]
