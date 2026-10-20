"""One-off anonymised audit of the live leak-detection run. Do not commit."""

from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

from dotenv import load_dotenv

from leak_intelligence.adapters import feature_transaction_from_row
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.common import (
    amount_of,
    is_purchase_reversal,
    is_purchase_spending_candidate,
    merchant_group_key,
)
from leak_intelligence.engine import (
    AMOUNT_TOLERANCE,
    DUPLICATE_DATE_WINDOW_DAYS,
    HIGH_CONFIDENCE,
    _has_reliable_irregular_category,
    _irregular_candidates,
    build_financial_features,
)
from leak_intelligence.leak_engine import (
    DETECTOR_VERSION,
    MIN_HISTORY_DAYS,
    _has_minimum_history,
    detect_leaks,
)
from leak_intelligence.leak_scoring import MIN_LEAK_CONFIDENCE, leak_confidence
from leak_intelligence.merchant_display import is_card_purchase_boilerplate
from leak_intelligence.models import ConfidenceSupport, FeatureTransaction
from categorisation.normalize import normalize_for_matching

load_dotenv(Path(__file__).resolve().parent / ".env")

SELECT = (
    "id,user_id,date,description,amount,type,is_duplicate,merchant_name,"
    "statement_id,category_confidence,category_rule,transaction_class,"
    "classification_confidence,classification_reason,categories(name)"
)
PAGE = 1000
USER_PREFIX = "953c5dad"


def _get(url: str, key: str, range_header: str | None = None) -> object:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    if range_header:
        headers["Range"] = range_header
        headers["Prefer"] = "count=exact"
    request = Request(url, headers=headers, method="GET")
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_rows(base: str, key: str) -> list[dict]:
    probe = _get(
        f"{base}/rest/v1/transactions?select=user_id&limit=2000",
        key,
    )
    user_ids = sorted(
        {
            row["user_id"]
            for row in probe
            if isinstance(row, dict)
            and str(row.get("user_id", "")).startswith(USER_PREFIX)
        }
    )
    if not user_ids:
        raise SystemExit("No matching user_id prefix in the authorised environment.")
    user_id = user_ids[0]
    print(f"matched_users={len(user_ids)} user_id_prefix={user_id[:8]}")
    url = (
        f"{base}/rest/v1/transactions?select={quote(SELECT, safe='(),.')}"
        f"&user_id=eq.{quote(user_id, safe='-')}&order=date.asc,id.asc"
    )
    rows: list[dict] = []
    for start in range(0, 20_000, PAGE):
        page = _get(url, key, range_header=f"{start}-{start + PAGE - 1}")
        if not isinstance(page, list):
            raise SystemExit("Unexpected transactions payload")
        rows.extend(page)
        if len(page) < PAGE:
            break
    return rows, user_id


def bucket_confidence(value: float) -> str:
    if value < 0.35:
        return "lt_0.35"
    if value < 0.55:
        return "0.35_0.54"
    if value < 0.70:
        return "0.55_0.69"
    if value < 0.85:
        return "0.70_0.84"
    return "ge_0.85"


def exclusion_reason(item: FeatureTransaction) -> str | None:
    if item.is_duplicate:
        return "marked_duplicate_import"
    if item.transaction_date is None:
        return "missing_date"
    if is_purchase_reversal(item) or item.transaction_type == "credit":
        if is_purchase_reversal(item):
            return "refund_or_reversal"
        return "credit_non_purchase"
    cls = item.categorisation.transaction_class or "unknown"
    if cls in {"internal_transfer", "person_to_person"}:
        return f"non_spending:{cls}"
    if cls in {"income", "savings", "investment", "bank_fee"}:
        return f"non_spending:{cls}"
    if cls == "unknown":
        return "unknown_class"
    if not is_purchase_spending_candidate(item):
        category = (item.categorisation.category_name or "").strip() or "none"
        return f"not_purchase_spending:{category}"
    return None


def main() -> None:
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    rows, user_id = fetch_rows(base, key)
    marked_duplicate = sum(1 for row in rows if row.get("is_duplicate"))
    transactions = [
        feature_transaction_from_row(row, expected_user_id=user_id) for row in rows
    ]
    active = [item for item in transactions if not item.is_duplicate]
    print("raw_rows", len(rows))
    print("marked_duplicate_imports", marked_duplicate)
    print("active_transactions", len(active))
    dates = [item.transaction_date for item in active if item.transaction_date]
    print(
        "period",
        min(dates).isoformat() if dates else None,
        max(dates).isoformat() if dates else None,
        "span_days",
        (max(dates) - min(dates)).days if dates else None,
    )

    class_counts = Counter(item.categorisation.transaction_class or "unknown" for item in active)
    print("transaction_class", dict(class_counts))
    category_counts = Counter(
        (item.categorisation.category_name or "none") for item in active
    )
    print("categories", dict(category_counts))
    rule_counts = Counter((item.categorisation.rule or "none") for item in active)
    print("category_rule", dict(rule_counts))
    cat_conf = Counter(bucket_confidence(item.categorisation.category_confidence) for item in active)
    class_conf = Counter(
        bucket_confidence(item.categorisation.classification_confidence) for item in active
    )
    print("category_confidence_buckets", dict(cat_conf))
    print("classification_confidence_buckets", dict(class_conf))

    unknown_merchant = 0
    unknown_category = 0
    fallback_rule = 0
    for item in active:
        if merchant_group_key(item) is None:
            unknown_merchant += 1
        category = (item.categorisation.category_name or "").strip()
        if not category or category.casefold() == "other":
            unknown_category += 1
        if (item.categorisation.rule or "").startswith("fallback"):
            fallback_rule += 1
    print("unknown_merchant", unknown_merchant)
    print("unknown_or_other_category", unknown_category)
    print("fallback_rule", fallback_rule)
    print("has_transaction_time", sum(item.transaction_time is not None for item in active))

    exclusions = Counter()
    eligible_purchase = 0
    for item in active:
        reason = exclusion_reason(item)
        if reason:
            exclusions[reason] += 1
        elif is_purchase_spending_candidate(item):
            eligible_purchase += 1
    print("exclusion_reasons", dict(exclusions))
    print("eligible_purchase_spending", eligible_purchase)

    irregular_gate = Counter()
    for item in active:
        if item.transaction_date is None:
            irregular_gate["missing_date"] += 1
        elif item.transaction_type == "credit":
            irregular_gate["credit"] += 1
        elif not is_purchase_spending_candidate(item):
            irregular_gate["not_purchase_spending"] += 1
        elif not _has_reliable_irregular_category(item):
            category = (item.categorisation.category_name or "").strip() or "none"
            rule = item.categorisation.rule or "none"
            if not category or category.casefold() == "other":
                irregular_gate["unreliable_category:other_or_missing"] += 1
            elif (rule or "").startswith("fallback"):
                irregular_gate["unreliable_category:fallback_rule"] += 1
            elif item.categorisation.category_confidence < Decimal("0.70"):
                irregular_gate["unreliable_category:low_confidence"] += 1
            else:
                irregular_gate[f"unreliable_category:{category}"] += 1
        elif amount_of(item) <= 0:
            irregular_gate["non_positive_amount"] += 1
        else:
            irregular_gate["eligible_for_irregular"] += 1
    print("irregular_eligibility", dict(irregular_gate))

    snapshot = build_financial_features(user_id, transactions)
    behaviours = analyze_behaviour(snapshot)
    print("history_sufficient", _has_minimum_history(snapshot), "min_days", MIN_HISTORY_DAYS)
    print("detector_version", DETECTOR_VERSION)
    print("merchants", len(snapshot.merchants))
    print("snapshot_categories", len(snapshot.categories))
    print("duplicate_candidates", len(snapshot.duplicate_candidates))
    print("irregular_candidates", len(snapshot.irregular_candidates))
    print("behaviour_observations", len(behaviours.observations))
    print(
        "behaviour_types",
        dict(Counter(item.behavior_type for item in behaviours.observations)),
    )

    # Near-miss irregular: eligible with amount>=500 but below 3x or thin baseline.
    eligible_irregular = [
        item
        for item in active
        if item.transaction_date is not None
        and item.transaction_type != "credit"
        and is_purchase_spending_candidate(item)
        and _has_reliable_irregular_category(item)
        and amount_of(item) > 0
    ]
    by_cat: dict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in eligible_irregular:
        by_cat[item.categorisation.category_name or "Other"].append(item)
    near_miss = Counter()
    large_unknown_merchant = 0
    for category, items in by_cat.items():
        amounts = [amount_of(item) for item in items]
        for item in items:
            if amount_of(item) < Decimal("500"):
                continue
            baseline = [amount_of(other) for other in items if other.transaction_id != item.transaction_id]
            if len(items) < 4 or len(baseline) < 3:
                near_miss["insufficient_category_history"] += 1
                continue
            baseline.sort()
            median = baseline[len(baseline) // 2]
            if median <= 0:
                near_miss["non_positive_baseline"] += 1
                continue
            multiple = amount_of(item) / median
            if multiple < Decimal("3"):
                near_miss["below_3x_median"] += 1
            else:
                near_miss["would_flag"] += 1
            if merchant_group_key(item) is None:
                large_unknown_merchant += 1
    print("irregular_large_txn_outcomes_ge_500", dict(near_miss))
    print("large_unknown_merchant_eligible_ge_500", large_unknown_merchant)

    # Duplicate pair evaluation without emitting descriptions.
    groups: dict[str, list[FeatureTransaction]] = defaultdict(list)
    unknown_desc_groups: dict[str, list[FeatureTransaction]] = defaultdict(list)
    skipped_no_merchant = 0
    for item in active:
        cls = item.categorisation.transaction_class or "unknown"
        if cls in {"income", "internal_transfer", "savings", "investment", "bank_fee", "person_to_person"}:
            continue
        if is_purchase_reversal(item) or item.transaction_date is None:
            continue
        merchant = merchant_group_key(item)
        if merchant is not None:
            groups[merchant].append(item)
            continue
        skipped_no_merchant += 1
        desc = normalize_for_matching(item.description or "")
        if desc and not is_card_purchase_boilerplate(item.description):
            unknown_desc_groups[desc].append(item)
    print("duplicate_merchant_groups", len(groups))
    print("duplicate_skipped_unknown_merchant", skipped_no_merchant)

    pair_stats = Counter()
    for items in groups.values():
        items.sort(key=lambda item: (item.transaction_date, item.transaction_id))
        for first, second in zip(items, items[1:]):
            pair_stats["adjacent_pairs_evaluated"] += 1
            same_amount = abs(amount_of(first) - amount_of(second)) <= AMOUNT_TOLERANCE
            nearby = (second.transaction_date - first.transaction_date).days <= DUPLICATE_DATE_WINDOW_DAYS
            if same_amount and nearby:
                pair_stats["same_day_same_amount"] += 1
            elif same_amount:
                pair_stats["same_amount_different_day"] += 1
            else:
                pair_stats["rejected_amount_or_date"] += 1
    print("duplicate_pair_stats", dict(pair_stats))
    print(
        "duplicate_candidates_debit_order",
        sum(1 for item in snapshot.duplicate_candidates if item.is_debit_order),
    )
    print(
        "duplicate_candidates_card",
        sum(1 for item in snapshot.duplicate_candidates if not item.is_debit_order),
    )

    suppression = Counter()
    for candidate in snapshot.duplicate_candidates:
        dates = candidate.transaction_dates
        high_confidence_ratio = (
            Decimal(candidate.high_confidence_transaction_count) / Decimal(len(dates))
            if dates
            else Decimal("0")
        )
        if candidate.is_debit_order:
            if len(dates) < 2:
                suppression["debit:lt_2_dates"] += 1
            elif not (0 <= candidate.billing_date_shift_days <= 5):
                suppression["debit:shift_out_of_window"] += 1
            elif candidate.amount < Decimal("20"):
                suppression["debit:amount_lt_20"] += 1
            elif high_confidence_ratio < Decimal("0.60"):
                suppression["debit:low_classification_confidence"] += 1
            elif candidate.nearby_reversal_or_refund:
                suppression["debit:nearby_reversal"] += 1
            elif candidate.recurring_debit_order_months < 2 or candidate.recurring_debit_order_count < 3:
                suppression["debit:insufficient_recurring_history"] += 1
            elif len(candidate.match_basis) < 4:
                suppression["debit:weak_match_basis"] += 1
            else:
                suppression["debit:would_consider"] += 1
            continue
        if len(dates) < 2:
            suppression["card:lt_2_dates"] += 1
        elif (max(dates) - min(dates)).days != 0:
            suppression["card:not_same_day"] += 1
        elif candidate.amount < Decimal("20"):
            suppression["card:amount_lt_20"] += 1
        elif high_confidence_ratio < Decimal("0.60"):
            suppression["card:low_classification_confidence"] += 1
        elif candidate.nearby_reversal_or_refund:
            suppression["card:nearby_reversal"] += 1
        elif candidate.distinct_description_count > 1 and not candidate.shared_reference_tokens:
            suppression["card:divergent_descriptions"] += 1
        else:
            support = ConfidenceSupport(
                supporting_transaction_count=len(dates),
                high_confidence_transaction_count=candidate.high_confidence_transaction_count,
                low_confidence_transaction_count=(
                    len(dates) - candidate.high_confidence_transaction_count
                ),
            )
            score = leak_confidence(
                support=support,
                observation_count=len(dates),
                pattern_strength=Decimal("0.48"),
                ceiling=Decimal("0.68"),
            )
            if score is None:
                suppression["card:below_confidence_threshold"] += 1
            else:
                suppression["card:would_flag"] += 1
    print("duplicate_finding_suppression", dict(suppression))

    unknown_same_day_pairs = 0
    for items in unknown_desc_groups.values():
        by_day: dict[object, list[FeatureTransaction]] = defaultdict(list)
        for item in items:
            by_day[item.transaction_date].append(item)
        for day_items in by_day.values():
            amounts = [amount_of(item) for item in day_items]
            for index, amount in enumerate(amounts):
                for other in amounts[index + 1 :]:
                    if abs(amount - other) <= AMOUNT_TOLERANCE:
                        unknown_same_day_pairs += 1
    print("unknown_merchant_same_desc_same_day_same_amount_pairs", unknown_same_day_pairs)

    result = detect_leaks(snapshot, behaviours)
    print("final_findings", len(result.leaks))
    print("finding_types", dict(Counter(item.leak_type for item in result.leaks)))
    print("transaction_count_in_result", result.transaction_count)
    print("min_leak_confidence", MIN_LEAK_CONFIDENCE)

    recurrence = Counter()
    for merchant in snapshot.merchants:
        recurrence[merchant.recurrence.recurrence_strength] += 1
    print("merchant_recurrence_strength", dict(recurrence))
    print(
        "merchants_with_3plus_obs",
        sum(1 for m in snapshot.merchants if m.recurrence.observation_count >= 3),
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("audit_failed", type(error).__name__, file=sys.stderr)
        raise
