"""Bank-provided category mappings → TracePay canonical taxonomy.

Statement/bank categories are evidence, never an unconditional final answer.
Unmapped or generic labels (e.g. Capite "Other") are ignored so deterministic
rules and merchant memory can win.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BankCategoryMapping:
    category_name: str
    transaction_class: str
    confidence: float
    """True when this bank label is specific enough to trust without a stronger rule."""
    strong: bool = True


# Provider key is a normalized bank identifier (capitec, fnb, ...).
BANK_CATEGORY_MAPPINGS: dict[str, dict[str, BankCategoryMapping]] = {
    "capitec": {
        "fees": BankCategoryMapping("Bank Fees", "bank_fee", 0.80),
        "fee": BankCategoryMapping("Bank Fees", "bank_fee", 0.80),
        "bank fees": BankCategoryMapping("Bank Fees", "bank_fee", 0.85),
        "groceries": BankCategoryMapping("Groceries", "spending", 0.90),
        "other income": BankCategoryMapping("Other Income", "income", 0.85),
        "income": BankCategoryMapping("Income", "income", 0.80),
        "salary": BankCategoryMapping("Salary", "income", 0.90),
        "transfer": BankCategoryMapping("Transfers", "internal_transfer", 0.70, strong=False),
        "transfers": BankCategoryMapping("Transfers", "internal_transfer", 0.70, strong=False),
        "transfer transfer": BankCategoryMapping("Transfers", "internal_transfer", 0.70, strong=False),
        "digital payments": BankCategoryMapping("Transfers", "person_to_person", 0.75, strong=False),
        "takeaways": BankCategoryMapping("Fast Food", "spending", 0.85),
        "movies": BankCategoryMapping("Entertainment", "spending", 0.85),
        "cellphone": BankCategoryMapping("Airtime & Data", "spending", 0.85),
        "interest": BankCategoryMapping("Other Income", "income", 0.80),
        "transport": BankCategoryMapping("Transport", "spending", 0.80),
        "public transport": BankCategoryMapping("Public Transport", "spending", 0.85),
        "fuel": BankCategoryMapping("Fuel", "spending", 0.85),
        "shopping": BankCategoryMapping("Shopping", "spending", 0.80),
        "restaurants": BankCategoryMapping("Restaurants", "spending", 0.85),
        "entertainment": BankCategoryMapping("Entertainment", "spending", 0.80),
        "utilities": BankCategoryMapping("Utilities", "spending", 0.85),
        "health": BankCategoryMapping("Healthcare", "spending", 0.80),
        "healthcare": BankCategoryMapping("Healthcare", "spending", 0.80),
        "education": BankCategoryMapping("Education", "spending", 0.80),
        "insurance": BankCategoryMapping("Insurance", "spending", 0.80),
        "savings": BankCategoryMapping("Savings", "savings", 0.85),
        # Explicitly ignored — never promote Capite "Other" as a strong answer.
        "other": BankCategoryMapping("Other", "unknown", 0.20, strong=False),
    },
    # Placeholders so additional banks can extend the same structure.
    "fnb": {},
    "standard bank": {},
    "nedbank": {},
    "absa": {},
    "discovery": {},
    "tymebank": {},
    "african bank": {},
}


def normalize_bank_name(bank: str | None) -> str:
    text = (bank or "").casefold().strip()
    if "capitec" in text:
        return "capitec"
    if text in BANK_CATEGORY_MAPPINGS:
        return text
    return text


def map_bank_category(
    raw_category: str | None,
    *,
    bank: str | None = None,
) -> BankCategoryMapping | None:
    """Map a raw bank statement category onto TracePay taxonomy when known."""
    if not raw_category or not str(raw_category).strip():
        return None
    label = " ".join(str(raw_category).casefold().split())
    if not label or label in {"other", "uncategorised", "uncategorized", "-"}:
        return None

    provider = normalize_bank_name(bank) or "capitec"
    provider_map = BANK_CATEGORY_MAPPINGS.get(provider, {})
    mapped = provider_map.get(label)
    if mapped is not None:
        return mapped if mapped.strong or mapped.category_name != "Other" else None

    # Generic cross-bank aliases (Fees/Transfer/etc.) when provider map misses.
    generic = BANK_CATEGORY_MAPPINGS["capitec"].get(label)
    if generic is None:
        return None
    if not generic.strong and generic.category_name == "Other":
        return None
    return generic
