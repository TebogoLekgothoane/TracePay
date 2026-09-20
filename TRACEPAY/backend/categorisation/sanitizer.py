import re


def sanitize_for_ai(description: str | None) -> str:
    """Remove account, phone, card and reference identifiers while preserving merchants."""
    text = re.sub(r"\b(?:\+?27|0)\d{9}\b", "[PHONE]", description or "", flags=re.IGNORECASE)
    text = re.sub(r"\b\d{10,20}\b", "[ACCOUNT_ID]", text)
    text = re.sub(r"\b(REF|REFERENCE|CARD|ACCT|ACCOUNT)[\s:#-]*[A-Z0-9-]{4,}\b", r"\1 [REDACTED]", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()
