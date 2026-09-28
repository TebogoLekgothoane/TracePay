from categorisation.sanitizer import sanitize_for_ai


def test_sanitize_compact_sa_phones() -> None:
    assert sanitize_for_ai("Call 0821234567 now") == "Call [PHONE] now"
    assert sanitize_for_ai("WhatsApp +27821234567") == "WhatsApp [PHONE]"


def test_sanitize_spaced_local_sa_phone() -> None:
    assert sanitize_for_ai("SMS from 082 123 4567 today") == "SMS from [PHONE] today"


def test_sanitize_spaced_international_sa_phone() -> None:
    assert sanitize_for_ai("Merchant +27 82 123 4567 Cape Town") == "Merchant [PHONE] Cape Town"


def test_sanitize_preserves_merchant_names() -> None:
    assert "WOOLWORTHS" in sanitize_for_ai("WOOLWORTHS 082 123 4567")
    assert "[PHONE]" in sanitize_for_ai("WOOLWORTHS 082 123 4567")


def test_sanitize_account_and_reference_tokens() -> None:
    text = sanitize_for_ai("REF ABC12345 CARD 4111111111111111")
    assert "ABC12345" not in text
    assert "[REDACTED]" in text or "[ACCOUNT_ID]" in text
