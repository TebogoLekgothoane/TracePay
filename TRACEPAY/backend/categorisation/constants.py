"""Shared categorisation constants aligned with the live Supabase categories table."""

from __future__ import annotations

FALLBACK_CATEGORY = "Other"

# When a transaction_class is known but no merchant category exists, use these.
CLASS_DEFAULT_CATEGORY: dict[str, str] = {
    "internal_transfer": "Transfers",
    "person_to_person": "Transfers",
    "bank_fee": "Bank Fees",
    "savings": "Savings",
    "investment": "Savings",
    "income": "Other Income",
    "spending": FALLBACK_CATEGORY,
    "unknown": FALLBACK_CATEGORY,
}

# Map common AI / free-text / bank aliases onto live category names.
CATEGORY_ALIASES: dict[str, str] = {
    "other": FALLBACK_CATEGORY,
    "uncategorised": FALLBACK_CATEGORY,
    "uncategorized": FALLBACK_CATEGORY,
    "person to person": "Transfers",
    "person-to-person": "Transfers",
    "p2p": "Transfers",
    "transfer": "Transfers",
    "transfers": "Transfers",
    "transfer transfer": "Transfers",
    "digital payments": "Transfers",
    "bank fee": "Bank Fees",
    "bank fees": "Bank Fees",
    "bank_fee": "Bank Fees",
    "fee": "Bank Fees",
    "fees": "Bank Fees",
    "airtime": "Airtime & Data",
    "data": "Airtime & Data",
    "airtime & data": "Airtime & Data",
    "cellphone": "Airtime & Data",
    "ride hailing": "Ride Hailing",
    "transport": "Transport",
    "grocery": "Groceries",
    "groceries": "Groceries",
    "subscription": "Subscriptions",
    "subscriptions": "Subscriptions",
    "restaurant": "Restaurants",
    "restaurants": "Restaurants",
    "fast food": "Fast Food",
    "takeaways": "Fast Food",
    "takeaway": "Fast Food",
    "fuel": "Fuel",
    "utilities": "Utilities",
    "salary": "Salary",
    "income": "Income",
    "other income": "Other Income",
    "interest": "Other Income",
    "savings": "Savings",
    "shopping": "Shopping",
    "entertainment": "Entertainment",
    "movies": "Entertainment",
    "healthcare": "Healthcare",
    "education": "Education",
    "housing": "Housing",
    "cash withdrawal": "Cash Withdrawal",
    "cash": "Cash Withdrawal",
}

# Only reuse merchant memory at or above this confidence.
MERCHANT_MEMORY_MIN_CONFIDENCE = 0.85
# AI classifications must be at least this confident before entering merchant memory.
MERCHANT_MEMORY_AI_MIN_CONFIDENCE = 0.90

# Cap confidence for weak/generic statement mappings.
WEAK_STATEMENT_CONFIDENCE_CAP = 0.75
FALLBACK_CONFIDENCE = 0.35
