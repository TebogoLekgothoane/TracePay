import re


# SA mobiles: 0XXXXXXXXX or +27XXXXXXXXX, allowing common grouping spaces.
_SA_PHONE = re.compile(
    r"(?<!\d)(?:\+?27|0)(?:\s*\d){9}(?!\d)",
    flags=re.IGNORECASE,
)


def sanitize_for_ai(description: str | None) -> str:
    """Remove account, phone, card and reference identifiers while preserving merchants."""
    text = _SA_PHONE.sub("[PHONE]", description or "")
    text = re.sub(r"\b\d{10,20}\b", "[ACCOUNT_ID]", text)
    text = re.sub(
        r"\b(REF|REFERENCE|CARD|ACCT|ACCOUNT)[\s:#-]*[A-Z0-9-]{4,}\b",
        r"\1 [REDACTED]",
        text,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", text).strip()
