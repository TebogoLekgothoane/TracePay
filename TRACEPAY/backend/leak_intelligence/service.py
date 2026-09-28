from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from statistics import median

from .models import FeatureTransaction, SpendingProfile

ZERO = Decimal("0")
DEFAULT_SMALL_TRANSACTION_THRESHOLD = Decimal("100")
FOOD_CATEGORIES = {"Groceries", "Restaurants", "Fast Food"}
TRANSPORT_CATEGORIES = {"Ride Hailing", "Public Transport", "Fuel"}
CASH_WITHDRAWAL_CATEGORIES = {"Cash Withdrawal", "Cash Withdrawals", "ATM Cash Withdrawal"}


def _amount(transaction: FeatureTransaction) -> Decimal:
    """Use an absolute amount so debits and credits can be compared by size."""
    return abs(Decimal(transaction.amount))


def _category_amounts(transactions: list[FeatureTransaction]) -> tuple[dict[str, Decimal], dict[str, int]]:
    spending_by_category: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    count_by_category: Counter[str] = Counter()
    for transaction in transactions:
        result = transaction.categorisation
        if result.transaction_class != "spending" or not result.category_name:
            continue
        category = result.category_name
        spending_by_category[category] += _amount(transaction)
        count_by_category[category] += 1
    return dict(spending_by_category), dict(count_by_category)


def _class_total(transactions: list[FeatureTransaction], transaction_class: str) -> Decimal | None:
    values = [_amount(item) for item in transactions if item.categorisation.transaction_class == transaction_class]
    return sum(values, ZERO) if values else None


def _ratio(numerator: Decimal | None, denominator: Decimal | None) -> Decimal | None:
    """Return a ratio only when both values exist and the denominator is non-zero."""
    if numerator is None or denominator in (None, ZERO):
        return None
    return numerator / denominator


def _merchant_key(transaction: FeatureTransaction) -> str | None:
    """Use the categoriser's merchant name, or a normalized description as a fallback."""
    value = transaction.merchant_name or transaction.categorisation.merchant_name or transaction.description
    normalized = " ".join(value.upper().split())
    return normalized or None


def _recurring_counts(transactions: list[FeatureTransaction]) -> tuple[int | None, int | None]:
    keys = [key for transaction in transactions if (key := _merchant_key(transaction))]
    if not keys:
        return None, None
    counts = Counter(keys)
    recurring_groups = sum(count > 1 for count in counts.values())
    recurring_payments = sum(count for count in counts.values() if count > 1)
    return recurring_groups, recurring_payments


def _frequency(transactions: list[FeatureTransaction]) -> Decimal | None:
    dates = [item.transaction_date for item in transactions if item.transaction_date is not None]
    if not dates:
        return None
    days = Decimal((max(dates) - min(dates)).days + 1)
    return Decimal(len(transactions)) / days


def build_spending_profile(
    transactions: list[FeatureTransaction],
    small_transaction_threshold: Decimal = DEFAULT_SMALL_TRANSACTION_THRESHOLD,
) -> SpendingProfile:
    """Build a feature vector from existing transaction classes and categories.

    No transaction is recategorised here. Missing categories remain missing, and
    ratios with no meaningful denominator remain ``None`` rather than becoming
    invented zeroes.
    """
    if not transactions:
        return SpendingProfile()

    amounts = [_amount(item) for item in transactions]
    income_total = _class_total(transactions, "income")
    spending_total = _class_total(transactions, "spending")
    spending_by_category, count_by_category = _category_amounts(transactions)
    small_values = [
        _amount(item)
        for item in transactions
        if item.categorisation.transaction_class == "spending"
        and _amount(item) <= small_transaction_threshold
    ]
    recurring_merchants, recurring_payments = _recurring_counts(transactions)
    transfer_total = sum(
        (_amount(item) for item in transactions if item.categorisation.transaction_class in {"internal_transfer", "person_to_person"}),
        ZERO,
    ) or None
    savings_total = _class_total(transactions, "savings")
    bank_fee_total = _class_total(transactions, "bank_fee")
    cash_values = [
        _amount(item) for item in transactions
        if item.categorisation.category_name in CASH_WITHDRAWAL_CATEGORIES
    ]
    cash_withdrawal_total = sum(cash_values, ZERO) if cash_values else None

    percentages = {
        category: amount / spending_total
        for category, amount in spending_by_category.items()
        if spending_total not in (None, ZERO)
    }
    concentration = sum((share * share for share in percentages.values()), ZERO) if percentages else None
    variability = (
        Decimal(len(spending_by_category)) / Decimal(sum(count_by_category.values()))
        if count_by_category and sum(count_by_category.values())
        else None
    )
    food_total = sum((amount for category, amount in spending_by_category.items() if category in FOOD_CATEGORIES), ZERO) or None
    transport_total = sum((amount for category, amount in spending_by_category.items() if category in TRANSPORT_CATEGORIES), ZERO) or None
    subscription_total = spending_by_category.get("Subscriptions")
    debt_total = next((amount for category, amount in spending_by_category.items() if category.lower() in {"debt payments", "loan payments", "credit repayments"}), None)

    return SpendingProfile(
        total_income=income_total,
        total_spending=spending_total,
        number_of_transactions=len(transactions),
        average_transaction_amount=sum(amounts, ZERO) / Decimal(len(amounts)),
        median_transaction_amount=Decimal(str(median(amounts))),
        largest_transaction=max(amounts),
        smallest_transaction=min(amounts),
        spending_by_category=spending_by_category,
        transaction_count_by_category=count_by_category,
        spending_percentage_by_category=percentages,
        small_transaction_count=len(small_values),
        small_transaction_total=sum(small_values, ZERO),
        recurring_merchant_count=recurring_merchants,
        recurring_payment_count=recurring_payments,
        bank_fee_total=bank_fee_total,
        transfer_total=transfer_total,
        savings_total=savings_total,
        cash_withdrawal_total=cash_withdrawal_total,
        transaction_frequency=_frequency(transactions),
        small_transaction_ratio=_ratio(sum(small_values, ZERO), spending_total),
        category_concentration=concentration,
        category_variability=variability,
        food_spending_ratio=_ratio(food_total, spending_total),
        transport_spending_ratio=_ratio(transport_total, spending_total),
        subscription_spending_ratio=_ratio(subscription_total, spending_total),
        bank_fee_ratio=_ratio(bank_fee_total, spending_total),
        cash_withdrawal_ratio=_ratio(cash_withdrawal_total, spending_total),
        debt_payment_ratio=_ratio(debt_total, spending_total),
        savings_ratio=_ratio(savings_total, spending_total),
    )
