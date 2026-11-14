"""Superadmin beta dashboard data: registrations, funnel, statements, sales and waitlist.

Read-only. Rows are read with the service role (the key never leaves the server) and reduced
here to counts, daily series and short masked lists. Email addresses and phone numbers are
masked before they leave this module.

Days are bucketed in South African time (UTC+02:00, no daylight saving), the market TracePay
serves and the zone the business reads its sales in.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, time as clock_time, timedelta, timezone
from typing import Any, Callable, Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app import billing
from app.config import settings

logger = logging.getLogger("tracepay.superadmin")

SA_TZ = timezone(timedelta(hours=2), name="SAST")
PAGE_SIZE = 1000
# Hard cap per table so one dashboard load stays bounded. Rows past it are flagged as truncated.
ROW_CAP = 20_000
TIMEOUT_SECONDS = 45
ATTEMPTS = 2
SNAPSHOT_TTL_SECONDS = 60
LIVE_SUBSCRIPTION_STATUSES = ("active", "non_renewing", "attention")
# Prefix of the message the app stores when a user cancels an import (not a processing failure).
CANCELLED_PREFIX = "PDF processing was cancelled"
RECENT_LIMIT = 25

_cache_lock = threading.Lock()
_cache: dict[str, Any] = {"at": None, "snapshot": None}


class TableMissing(Exception):
    """The table is not in the database yet (its migration has not been applied)."""

    def __init__(self, table: str) -> None:
        super().__init__(table)
        self.table = table


# Migration that creates each table, shown when a table is missing.
MIGRATION_FOR_TABLE = {
    "waitlist_signups": "202611040001_waitlist_signups.sql",
    "ai_budget_usage": "202611140001_ai_daily_budget.sql",
    "ai_usage_events": "202611140002_ai_usage_events.sql",
    "billing_purchases": "202610260001_billing_entitlements.sql",
    "monitoring_subscriptions": "202610260001_billing_entitlements.sql",
    "finding_answers": "202610270001_finding_answers.sql",
    "statement_imports": "202609200001_pdf_statement_ingestion.sql",
    "transactions": "202609200001_pdf_statement_ingestion.sql",
}

FEATURE_LABELS = {
    "transaction_categorisation": "Transaction categorisation",
    "subscription_merchant_labels": "Subscription merchant naming",
    "subscription_reason": "Subscription explanations",
}

# Approximate list prices in USD per million tokens (input, output). Used only to estimate cost.
# Override or extend with AI_MODEL_PRICES_JSON, e.g. {"openai/gpt-4o-mini": [0.15, 0.6]}.
DEFAULT_MODEL_PRICES: dict[str, tuple[float, float]] = {
    "openai/gpt-4o-mini": (0.15, 0.60),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1-mini": (0.40, 1.60),
    "grok-4-1-fast-non-reasoning": (0.20, 0.50),
}


@dataclass
class Snapshot:
    users: list[dict[str, Any]] = field(default_factory=list)
    statement_imports: list[dict[str, Any]] = field(default_factory=list)
    purchases: list[dict[str, Any]] = field(default_factory=list)
    subscriptions: list[dict[str, Any]] = field(default_factory=list)
    answer_rows: list[dict[str, Any]] = field(default_factory=list)
    waitlist: list[dict[str, Any]] = field(default_factory=list)
    budget_rows: list[dict[str, Any]] = field(default_factory=list)
    ai_events: list[dict[str, Any]] = field(default_factory=list)
    transaction_count: int = 0
    truncated: list[str] = field(default_factory=list)
    missing_tables: list[str] = field(default_factory=list)
    stale: bool = False
    loaded_at: datetime | None = None


# --- Reading the database (service role) ------------------------------------------------


def _get(path: str, *, count: bool = False) -> tuple[Any, dict[str, str]]:
    headers = {**billing._service_headers(), "Accept": "application/json"}
    if count:
        headers["Prefer"] = "count=exact"
    url = f"{settings.supabase_url.strip().rstrip('/')}{path}"
    for attempt in range(ATTEMPTS):
        try:
            with urlopen(Request(url, headers=headers, method="GET"), timeout=TIMEOUT_SECONDS) as response:
                raw = response.read().decode("utf-8")
                response_headers = {key.lower(): value for key, value in response.headers.items()}
            return (json.loads(raw) if raw else []), response_headers
        except HTTPError as error:
            if error.code == 404 and path.startswith("/rest/v1/"):
                raise TableMissing(path.split("?")[0].removeprefix("/rest/v1/")) from None
            logger.warning("superadmin_fetch_failed path=%s status=%s", path.split("?")[0], error.code)
            raise HTTPException(status_code=503, detail="Dashboard data is temporarily unavailable.") from None
        except (URLError, TimeoutError, OSError, ValueError):
            # A slow or flaky link is retried once before giving up.
            logger.warning(
                "superadmin_fetch_failed path=%s error_type=transport attempt=%s", path.split("?")[0], attempt + 1
            )
    raise HTTPException(
        status_code=503,
        detail="The database did not respond in time. Check the connection from this server to Supabase, then refresh.",
    )


def _fetch_table(table: str, select: str, order: str, filters: str = "") -> tuple[list[dict[str, Any]], bool]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while len(rows) < ROW_CAP:
        page, _ = _get(
            f"/rest/v1/{table}?select={select}&order={order}"
            f"&limit={PAGE_SIZE}&offset={offset}{filters}"
        )
        if not isinstance(page, list):
            break
        rows.extend(item for item in page if isinstance(item, dict))
        if len(page) < PAGE_SIZE:
            return rows, False
        offset += PAGE_SIZE
    return rows[:ROW_CAP], True


def _count_table(table: str) -> int:
    _, headers = _get(f"/rest/v1/{table}?select=id&limit=1", count=True)
    content_range = headers.get("content-range", "")
    total = content_range.rpartition("/")[2]
    return int(total) if total.isdigit() else 0


def _fetch_users() -> tuple[list[dict[str, Any]], bool]:
    """Every auth user. Pages until one comes back empty, so a server-side page-size cap
    smaller than the one asked for cannot silently under-count accounts."""
    users: dict[str, dict[str, Any]] = {}
    page = 1
    while len(users) < ROW_CAP:
        payload, _ = _get(f"/auth/v1/admin/users?page={page}&per_page={PAGE_SIZE}")
        batch = payload.get("users") if isinstance(payload, dict) else payload
        if not isinstance(batch, list):
            break
        rows = [item for item in batch if isinstance(item, dict)]
        fresh = [item for item in rows if isinstance(item.get("id"), str) and item["id"] not in users]
        if not fresh:
            return list(users.values()), False
        users.update({item["id"]: item for item in fresh})
        page += 1
    return list(users.values())[:ROW_CAP], True


# Table -> (columns, order). Each is read independently, so one missing table cannot blank the page.
_TABLE_READS: dict[str, tuple[str, str]] = {
    "statement_imports": (
        "user_id,status,extraction_method,error_message,transaction_count,created_at",
        "created_at.desc",
    ),
    "billing_purchases": (
        "user_id,product,status,amount_cents,paid_at,refunded_at,created_at",
        "created_at.desc",
    ),
    "monitoring_subscriptions": (
        "user_id,status,current_period_end,cancel_at_period_end,created_at",
        "created_at.desc",
    ),
    "finding_answers": ("user_id,status,answered_at", "answered_at.desc"),
    "waitlist_signups": ("email,interests,source,created_at", "created_at.desc"),
    "ai_budget_usage": ("user_id,used,window_start", "window_start.desc"),
    "ai_usage_events": (
        "feature,provider,model,outcome,items,prompt_tokens,completion_tokens,total_tokens,duration_ms,created_at",
        "created_at.desc",
    ),
}


def _read_table(table: str) -> tuple[list[dict[str, Any]], bool] | None:
    select, order = _TABLE_READS[table]
    try:
        return _fetch_table(table, select, order)
    except TableMissing:
        return None


def _read_transaction_count() -> int | None:
    try:
        return _count_table("transactions")
    except TableMissing:
        return None


def load_snapshot() -> Snapshot:
    """Read every table at once. A table that does not exist yet is reported, not fatal."""
    snapshot = Snapshot()
    with ThreadPoolExecutor(max_workers=4, thread_name_prefix="superadmin") as pool:
        users_job = pool.submit(_fetch_users)
        table_jobs = {table: pool.submit(_read_table, table) for table in _TABLE_READS}
        count_job = pool.submit(_read_transaction_count)
        snapshot.users, capped = users_job.result()
        if capped:
            snapshot.truncated.append("users")
        results: dict[str, list[dict[str, Any]]] = {}
        for table, job in table_jobs.items():
            outcome = job.result()
            if outcome is None:
                snapshot.missing_tables.append(table)
                results[table] = []
                continue
            results[table], capped = outcome
            if capped:
                snapshot.truncated.append(table)
        count = count_job.result()
    if count is None:
        snapshot.missing_tables.append("transactions")
    snapshot.transaction_count = count or 0
    snapshot.statement_imports = results["statement_imports"]
    snapshot.purchases = results["billing_purchases"]
    snapshot.subscriptions = results["monitoring_subscriptions"]
    snapshot.answer_rows = results["finding_answers"]
    snapshot.waitlist = results["waitlist_signups"]
    snapshot.budget_rows = results["ai_budget_usage"]
    snapshot.ai_events = results["ai_usage_events"]
    snapshot.loaded_at = datetime.now(timezone.utc)
    return snapshot


def get_snapshot(*, force: bool = False) -> Snapshot:
    """Return a recent snapshot. Cached briefly so refreshes do not re-read every table."""
    with _cache_lock:
        cached_at = _cache["at"]
        fresh = cached_at is not None and time.monotonic() - cached_at < SNAPSHOT_TTL_SECONDS
        if force or not fresh or _cache["snapshot"] is None:
            try:
                _cache["snapshot"] = load_snapshot()
                _cache["at"] = time.monotonic()
            except HTTPException:
                # Keep showing the last good load, flagged as stale, rather than a blank page.
                previous = _cache["snapshot"]
                if previous is None:
                    raise
                previous.stale = True
                return previous
        return _cache["snapshot"]


# --- Pure aggregation (no I/O) ----------------------------------------------------------


def _stamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    return f"{local[:2]}***@{domain}"


def _mask_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    return f"***{digits[-4:]}" if digits else "***"


def _clean_error(message: object) -> str:
    if not isinstance(message, str) or not message.strip():
        return "No message recorded"
    return " ".join(message.split())[:120]


def _bucket(
    items: Iterable[dict[str, Any]],
    when: Callable[[dict[str, Any]], datetime | None],
    day_keys: list[Any],
    value: Callable[[dict[str, Any]], float] = lambda _item: 1,
) -> list[float]:
    index = {day: position for position, day in enumerate(day_keys)}
    totals = [0.0] * len(day_keys)
    for item in items:
        stamp = when(item)
        if stamp is None:
            continue
        position = index.get(stamp.astimezone(SA_TZ).date())
        if position is not None:
            totals[position] += value(item)
    return totals


def _round(values: list[float]) -> list[float]:
    return [round(v, 2) for v in values]


def _zar(cents: float) -> float:
    return round(cents / 100, 2)


def _model_prices(raw: str) -> dict[str, tuple[float, float]]:
    prices = dict(DEFAULT_MODEL_PRICES)
    if raw.strip():
        try:
            parsed = json.loads(raw)
        except ValueError:
            parsed = {}
        if isinstance(parsed, dict):
            for model, pair in parsed.items():
                if (
                    isinstance(model, str)
                    and isinstance(pair, (list, tuple))
                    and len(pair) == 2
                    and all(isinstance(part, (int, float)) and not isinstance(part, bool) for part in pair)
                ):
                    prices[model] = (float(pair[0]), float(pair[1]))
    return prices


def _event_cost(model: str, prompt: int, completion: int, prices: dict[str, tuple[float, float]]) -> float | None:
    match = max((key for key in prices if model == key or model.startswith(key)), key=len, default=None)
    if match is None:
        return None
    input_price, output_price = prices[match]
    return (prompt * input_price + completion * output_price) / 1_000_000


def _build_ai(
    snapshot: Snapshot,
    *,
    users: dict[str, dict[str, Any]],
    in_range: Callable[[datetime | None], bool],
    day_keys: list[Any],
    labels: list[str],
    daily_item_limit: int,
    price_overrides: str,
) -> dict[str, Any]:
    prices = _model_prices(price_overrides)
    events = [{**row, "_at": _stamp(row.get("created_at"))} for row in snapshot.ai_events]
    window = [row for row in events if in_range(row["_at"])]

    def tokens(row: dict[str, Any], key: str) -> int:
        value = row.get(key)
        return value if isinstance(value, int) and not isinstance(value, bool) else 0

    def summarise(rows: list[dict[str, Any]]) -> dict[str, Any]:
        cost = 0.0
        unpriced = 0
        latencies: list[int] = []
        for row in rows:
            event_cost = _event_cost(
                str(row.get("model")), tokens(row, "prompt_tokens"), tokens(row, "completion_tokens"), prices
            )
            if event_cost is None:
                unpriced += tokens(row, "total_tokens")
            else:
                cost += event_cost
            if isinstance(row.get("duration_ms"), int):
                latencies.append(row["duration_ms"])
        outcomes = Counter(str(row.get("outcome")) for row in rows)
        return {
            "calls": len(rows),
            "items": sum(tokens(row, "items") for row in rows),
            "success": outcomes.get("success", 0),
            "rejected": outcomes.get("rejected", 0),
            "failed": outcomes.get("failed", 0),
            "tokens_in": sum(tokens(row, "prompt_tokens") for row in rows),
            "tokens_out": sum(tokens(row, "completion_tokens") for row in rows),
            "tokens": sum(tokens(row, "total_tokens") for row in rows),
            "cost_usd": round(cost, 4),
            "unpriced_tokens": unpriced,
            "avg_ms": round(sum(latencies) / len(latencies)) if latencies else None,
        }

    features = sorted({str(row.get("feature")) for row in window})
    by_feature = []
    daily_by_feature = []
    for feature in features:
        rows = [row for row in window if str(row.get("feature")) == feature]
        by_feature.append({
            "feature": feature,
            "label": FEATURE_LABELS.get(feature, feature.replace("_", " ").capitalize()),
            **summarise(rows),
        })
        daily_by_feature.append({
            "feature": feature,
            "label": FEATURE_LABELS.get(feature, feature.replace("_", " ").capitalize()),
            "values": [int(v) for v in _bucket(rows, lambda r: r["_at"], day_keys)],
        })
    by_feature.sort(key=lambda item: (item["tokens"], item["calls"]), reverse=True)

    models = sorted({(str(row.get("provider")), str(row.get("model"))) for row in window})
    by_model = sorted(
        (
            {"provider": provider, "model": model, **summarise(
                [r for r in window if str(r.get("provider")) == provider and str(r.get("model")) == model]
            )}
            for provider, model in models
        ),
        key=lambda item: (item["tokens"], item["calls"]),
        reverse=True,
    )

    budget_rows = sorted(snapshot.budget_rows, key=lambda row: int(row.get("used") or 0), reverse=True)
    top_users = [
        {
            "user": users[str(row.get("user_id"))]["label"] if str(row.get("user_id")) in users else "unknown",
            "used": int(row.get("used") or 0),
            "pct_of_limit": round(100 * int(row.get("used") or 0) / daily_item_limit, 1) if daily_item_limit else 0.0,
        }
        for row in budget_rows[:5]
        if int(row.get("used") or 0) > 0
    ]

    return {
        "logging_ready": "ai_usage_events" not in snapshot.missing_tables,
        "total": summarise(window),
        "by_feature": by_feature,
        "by_model": by_model,
        "series": {
            "labels": labels,
            "calls_by_feature": daily_by_feature,
            "tokens": _round(_bucket(window, lambda r: r["_at"], day_keys, lambda r: tokens(r, "total_tokens"))),
        },
        "budget": {
            "daily_item_limit": daily_item_limit,
            "items_used_current_window": sum(int(row.get("used") or 0) for row in snapshot.budget_rows),
            "users_with_usage": sum(1 for row in snapshot.budget_rows if int(row.get("used") or 0) > 0),
            "top_users": top_users,
        },
        "prices_note": "Cost is an estimate from list prices per million tokens. Set AI_MODEL_PRICES_JSON to correct it.",
    }


def build_metrics(
    snapshot: Snapshot,
    *,
    days: int,
    now: datetime,
    full_price_cents: int,
    monitoring_price_cents: int,
    ai_daily_item_limit: int = 2000,
    ai_price_overrides: str = "",
) -> dict[str, Any]:
    now = now.astimezone(timezone.utc)
    today = now.astimezone(SA_TZ).date()
    start_day = today - timedelta(days=days - 1)
    day_keys = [start_day + timedelta(days=offset) for offset in range(days)]
    range_start = datetime.combine(start_day, clock_time.min, tzinfo=SA_TZ)
    today_start = datetime.combine(today, clock_time.min, tzinfo=SA_TZ)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    def in_range(stamp: datetime | None) -> bool:
        return stamp is not None and range_start <= stamp <= now + timedelta(minutes=5)

    labels = [day.isoformat() for day in day_keys]

    def series(values: list[float]) -> dict[str, list[Any]]:
        return {"labels": labels, "values": _round(values)}

    # Users (registrations). Auth rows carry created_at, last_sign_in_at, email and phone.
    users: dict[str, dict[str, Any]] = {}
    for raw in snapshot.users:
        user_id = raw.get("id")
        created = _stamp(raw.get("created_at"))
        if not isinstance(user_id, str) or created is None:
            continue
        email = raw.get("email") if isinstance(raw.get("email"), str) else ""
        phone = raw.get("phone") if isinstance(raw.get("phone"), str) else ""
        label = _mask_email(email) if email else _mask_phone(phone) if phone else "***"
        users[user_id] = {
            "id": user_id,
            "created": created,
            "last_sign_in": _stamp(raw.get("last_sign_in_at")),
            "has_email": bool(email),
            "has_phone": bool(phone),
            # Sign-up creates the account first; the phone only counts once its code is entered.
            "verified": bool(
                raw.get("phone_confirmed_at") or raw.get("email_confirmed_at") or raw.get("confirmed_at")
            ),
            "label": label,
        }
    user_list = list(users.values())
    total_users = len(user_list)
    verified_users = sum(1 for u in user_list if u["verified"])

    imports = [
        {**row, "_at": _stamp(row.get("created_at"))} for row in snapshot.statement_imports
    ]
    imports_in_range = [row for row in imports if in_range(row["_at"])]
    imports_per_user = Counter(str(row.get("user_id")) for row in imports)
    uploaded_users = {str(row.get("user_id")) for row in imports}
    processed_users = {str(row.get("user_id")) for row in imports if row.get("status") == "processed"}

    purchases = [
        {**row, "_created": _stamp(row.get("created_at")), "_paid": _stamp(row.get("paid_at")) or _stamp(row.get("created_at"))}
        for row in snapshot.purchases
    ]
    succeeded = [row for row in purchases if row.get("status") == "succeeded"]
    succeeded_in_range = [row for row in succeeded if in_range(row["_paid"])]

    subscriptions = [
        {**row, "_end": _stamp(row.get("current_period_end"))} for row in snapshot.subscriptions
    ]
    live_subscriptions = [
        row
        for row in subscriptions
        if row.get("status") in LIVE_SUBSCRIPTION_STATUSES and row["_end"] is not None and row["_end"] > now
    ]

    paying_users = {str(row.get("user_id")) for row in succeeded} | {
        str(row.get("user_id")) for row in live_subscriptions
    }
    # A skipped question is recorded too; only a real answer counts as engagement.
    answer_users = {
        str(row.get("user_id")) for row in snapshot.answer_rows if row.get("status", "answered") == "answered"
    }

    # --- Registrations ---
    registrations = {
        "total": total_users,
        "verified": verified_users,
        "unverified": total_users - verified_users,
        "new_verified_in_range": sum(1 for u in user_list if u["verified"] and in_range(u["created"])),
        "new_today": sum(1 for u in user_list if u["created"] >= today_start),
        "new_7d": sum(1 for u in user_list if u["created"] >= week_ago),
        "new_30d": sum(1 for u in user_list if u["created"] >= month_ago),
        "new_in_range": sum(1 for u in user_list if in_range(u["created"])),
        "active_7d": sum(1 for u in user_list if u["last_sign_in"] and u["last_sign_in"] >= week_ago),
        "active_30d": sum(1 for u in user_list if u["last_sign_in"] and u["last_sign_in"] >= month_ago),
        "signed_up_once": sum(
            1
            for u in user_list
            if u["last_sign_in"] is None or (u["last_sign_in"] - u["created"]) < timedelta(hours=1)
        ),
        "with_email": sum(1 for u in user_list if u["has_email"]),
        "with_phone": sum(1 for u in user_list if u["has_phone"]),
        "signups": series(_bucket(user_list, lambda u: u["created"], day_keys)),
    }

    # --- Statements ---
    status_all = Counter(str(row.get("status")) for row in imports)
    status_range = Counter(str(row.get("status")) for row in imports_in_range)
    processed_in_range = [row for row in imports_in_range if row.get("status") == "processed"]
    # A user backing out is recorded as a failed import but is not a processing failure.
    def is_cancelled(row: dict[str, Any]) -> bool:
        return row.get("status") == "failed" and _clean_error(row.get("error_message")).startswith(CANCELLED_PREFIX)

    cancelled_in_range = [row for row in imports_in_range if is_cancelled(row)]
    failed_in_range = [
        row for row in imports_in_range if row.get("status") == "failed" and not is_cancelled(row)
    ]
    # Only finished attempts count: uploads still queued or processing are neither success nor failure.
    finished = len(processed_in_range) + len(failed_in_range)
    failure_rate = round(len(failed_in_range) / finished, 4) if finished else 0.0
    statements = {
        "cancelled_in_range": len(cancelled_in_range),
        "total": len(imports),
        "in_range": len(imports_in_range),
        "status_all": dict(status_all),
        "status_range": dict(status_range),
        "extraction_methods": dict(
            Counter(str(row.get("extraction_method")) for row in processed_in_range)
        ),
        "failure_rate": failure_rate,
        "transactions_imported_in_range": sum(int(row.get("transaction_count") or 0) for row in processed_in_range),
        "transactions_total": snapshot.transaction_count,
        "users_uploaded": len(uploaded_users),
        "uploaded_not_processed": len(uploaded_users - processed_users),
        "series": {
            "uploaded": series(_bucket(imports_in_range, lambda r: r["_at"], day_keys)),
            "processed": series(
                _bucket(processed_in_range, lambda r: r["_at"], day_keys)
            ),
            "failed": series(_bucket(failed_in_range, lambda r: r["_at"], day_keys)),
        },
        "failure_reasons": [
            {"reason": reason, "count": count}
            for reason, count in Counter(_clean_error(r.get("error_message")) for r in failed_in_range).most_common(8)
        ],
    }

    # --- Sales ---
    revenue_all = sum(int(row.get("amount_cents") or 0) for row in succeeded)
    refunded = [row for row in purchases if row.get("status") == "refunded"]
    revenue_range = sum(int(row.get("amount_cents") or 0) for row in succeeded_in_range)
    product_cents: Counter[str] = Counter()
    product_count: Counter[str] = Counter()
    for row in succeeded:
        product = str(row.get("product"))
        product_count[product] += 1
        product_cents[product] += int(row.get("amount_cents") or 0)
    by_product = {
        product: {"count": product_count[product], "revenue_zar": _zar(product_cents[product])}
        for product in product_count
    }
    subscription_status = Counter(str(row.get("status")) for row in subscriptions)
    monitoring_value_cents = len(live_subscriptions) * monitoring_price_cents
    # Rates use verified users: an account whose phone was never confirmed is not a real user.
    conversion_pct = round(100 * len(paying_users) / verified_users, 2) if verified_users else 0.0
    sales = {
        "paying_users": len(paying_users),
        "conversion_pct": conversion_pct,
        "revenue_all_zar": _zar(revenue_all),
        "revenue_range_zar": _zar(revenue_range),
        "sales_in_range": len(succeeded_in_range),
        "arpu_zar": round(revenue_all / 100 / verified_users, 2) if verified_users else 0.0,
        "refunded_count": len(refunded),
        "refunded_zar": _zar(sum(int(row.get("amount_cents") or 0) for row in refunded)),
        "status_counts": dict(Counter(str(row.get("status")) for row in purchases)),
        "by_product": by_product,
        "price_zar": {
            "full_analysis": _zar(full_price_cents),
            "annual_monitoring": _zar(monitoring_price_cents),
        },
        "subscription_status": dict(subscription_status),
        "monitoring_live": len(live_subscriptions),
        "monitoring_cancelling": sum(1 for row in live_subscriptions if row.get("cancel_at_period_end")),
        "monitoring_value_zar": _zar(monitoring_value_cents),
        "series": {
            "revenue": series(
                _bucket(succeeded_in_range, lambda r: r["_paid"], day_keys, lambda r: int(r.get("amount_cents") or 0) / 100)
            ),
            "sales": series(_bucket(succeeded_in_range, lambda r: r["_paid"], day_keys)),
        },
        "recent": [
            {
                "when": row["_created"].isoformat() if row["_created"] else None,
                "user": users[str(row.get("user_id"))]["label"] if str(row.get("user_id")) in users else "unknown",
                "product": row.get("product"),
                "amount_zar": _zar(int(row.get("amount_cents") or 0)),
                "status": row.get("status"),
            }
            for row in purchases[:RECENT_LIMIT]
        ],
    }

    # --- Funnel (all time, distinct users) ---
    funnel = [
        {"stage": "Account created", "count": total_users},
        {"stage": "Phone verified", "count": verified_users},
        {"stage": "Uploaded a statement", "count": len(uploaded_users & set(users))},
        {"stage": "Statement processed", "count": len(processed_users & set(users))},
        {"stage": "Answered a finding question", "count": len(answer_users & set(users))},
        {"stage": "Paying", "count": len(paying_users & set(users))},
    ]

    # --- Waitlist ---
    waitlist = snapshot.waitlist
    waitlist_stamped = [{**row, "_at": _stamp(row.get("created_at"))} for row in waitlist]
    waitlist_before = sum(1 for row in waitlist_stamped if row["_at"] is not None and row["_at"] < range_start)
    waitlist_daily = _bucket(waitlist_stamped, lambda r: r["_at"], day_keys)
    running = waitlist_before
    cumulative: list[float] = []
    for value in waitlist_daily:
        running += value
        cumulative.append(running)
    interests = Counter(
        str(interest) for row in waitlist for interest in (row.get("interests") or [])
    )
    waitlist_out = {
        "total": len(waitlist),
        "in_range": sum(1 for row in waitlist_stamped if in_range(row["_at"])),
        "interests": dict(interests),
        "sources": dict(Counter(str(row.get("source") or "website") for row in waitlist)),
        "series": series(waitlist_daily),
        "cumulative": series(cumulative),
    }

    ai = _build_ai(
        snapshot,
        users=users,
        in_range=in_range,
        day_keys=day_keys,
        labels=labels,
        daily_item_limit=ai_daily_item_limit,
        price_overrides=ai_price_overrides,
    )

    # --- Alerts ---
    alerts: list[dict[str, str]] = []
    if snapshot.stale:
        loaded = snapshot.loaded_at.astimezone(SA_TZ).strftime("%d %b %H:%M") if snapshot.loaded_at else "earlier"
        alerts.append({
            "level": "warning",
            "text": f"The database could not be reached just now. These figures are from the last successful load ({loaded}).",
        })
    for table in snapshot.missing_tables:
        migration = MIGRATION_FOR_TABLE.get(table, "its migration")
        alerts.append({
            "level": "warning",
            "text": f"The {table} table is not in the database yet, so its figures are empty. Apply {migration}.",
        })
    if len(failed_in_range) >= 3 and failure_rate >= 0.2:
        alerts.append({
            "level": "warning",
            "text": f"{len(failed_in_range)} of {finished} finished statement imports failed in this range ({round(failure_rate * 100)}%).",
        })
    if statements["uploaded_not_processed"] >= 5:
        alerts.append({
            "level": "info",
            "text": f"{statements['uploaded_not_processed']} users uploaded a statement that was never processed.",
        })
    if registrations["new_in_range"] > 0 and not succeeded_in_range:
        alerts.append({"level": "info", "text": "New sign-ups in this range, but no sales yet."})
    for table in snapshot.truncated:
        alerts.append({"level": "warning", "text": f"{table} hit the {ROW_CAP:,} row cap, so its figures are partial."})

    recent_signups = [
        {
            "when": u["created"].isoformat(),
            "user": u["label"],
            "last_sign_in": u["last_sign_in"].isoformat() if u["last_sign_in"] else None,
            "statements": imports_per_user.get(u["id"], 0),
            "paying": u["id"] in paying_users,
        }
        for u in sorted(user_list, key=lambda u: u["created"], reverse=True)[:RECENT_LIMIT]
    ]

    kpis = {
        "registered_total": verified_users,
        "accounts_total": total_users,
        "unverified_total": total_users - verified_users,
        "new_in_range": registrations["new_in_range"],
        "active_7d": registrations["active_7d"],
        "statements_in_range": statements["in_range"],
        "processed_in_range": status_range.get("processed", 0),
        "paying_users": sales["paying_users"],
        "sales_in_range": sales["sales_in_range"],
        "revenue_range_zar": sales["revenue_range_zar"],
        "revenue_all_zar": sales["revenue_all_zar"],
        "conversion_pct": conversion_pct,
        "arpu_zar": sales["arpu_zar"],
        "monitoring_live": sales["monitoring_live"],
        "waitlist_total": waitlist_out["total"],
        "failure_rate": failure_rate,
    }

    return {
        "generated_at": now.isoformat(),
        "loaded_at": snapshot.loaded_at.isoformat() if snapshot.loaded_at else None,
        "range_days": days,
        "range_start": start_day.isoformat(),
        "timezone": "Africa/Johannesburg (UTC+02:00)",
        "truncated": list(snapshot.truncated),
        "missing_tables": list(snapshot.missing_tables),
        "kpis": kpis,
        "alerts": alerts,
        "registrations": registrations,
        "funnel": funnel,
        "statements": statements,
        "sales": sales,
        "waitlist": waitlist_out,
        "ai": ai,
        "recent_signups": recent_signups,
    }
