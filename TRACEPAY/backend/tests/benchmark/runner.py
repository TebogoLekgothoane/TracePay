"""Run the synthetic customers through the engine and score the result.

Run it directly to write the report:

    python -m tests.benchmark.runner docs/leak-benchmark-report.md
"""

from __future__ import annotations

import sys
import time as clock
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

from categorisation.classifier import classify_transaction
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.finding_overlap import (
    mark_explained_findings,
    split_for_display,
    summarise_impact,
)
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.leak_models import LeakDetection, LeakDetectionResult
from leak_intelligence.models import FeatureTransaction

from tests.benchmark.customers import Customer, Expected, build_customers

AMOUNT_TOLERANCE = Decimal("0.01")


@dataclass
class Match:
    expected: Expected
    leak: LeakDetection
    amount_ok: bool | None
    observed_ok: bool | None
    status_ok: bool | None


@dataclass
class CustomerResult:
    customer: Customer
    result: LeakDetectionResult
    matches: list[Match] = field(default_factory=list)
    false_negatives: list[Expected] = field(default_factory=list)
    false_positives: list[LeakDetection] = field(default_factory=list)
    recurring_total: Decimal = Decimal("0")
    recurring_before_dedupe: Decimal = Decimal("0")
    total_ok: bool | None = None
    over_counted: bool = False
    idempotent: bool = True
    seconds: float = 0.0


def run_pipeline(transactions: list[FeatureTransaction], user_id: str = "user-a") -> LeakDetectionResult:
    snapshot = build_financial_features(user_id, transactions)
    detected = detect_leaks(snapshot, analyze_behaviour(snapshot))
    detected = mark_explained_findings(attach_supporting_transactions(detected, transactions))
    detected = detected.model_copy(update={"impact_summary": summarise_impact(detected.leaks)})
    # Scored as the customer sees it; explained findings stay in ``explained_leaks``.
    return split_for_display(detected)


def _subject_of(leak: LeakDetection) -> str:
    evidence = leak.evidence
    for key in ("merchant_key", "description_signature"):
        value = evidence.get(key)
        if isinstance(value, str):
            return value.upper()
    return ""


def _matches(expected: Expected, leak: LeakDetection) -> bool:
    if leak.leak_type != expected.leak_type:
        return False
    if expected.focus is not None and leak.evidence.get("finding_focus") != expected.focus:
        return False
    if expected.subject is not None and expected.subject.upper() not in _subject_of(leak):
        return False
    return True


def _dec(value: object) -> Decimal | None:
    try:
        return None if value is None else Decimal(str(value))
    except Exception:  # noqa: BLE001
        return None


def score_customer(customer: Customer) -> CustomerResult:
    started = clock.perf_counter()
    result = run_pipeline(customer.transactions)
    again = run_pipeline(customer.transactions)
    scored = CustomerResult(customer, result)
    scored.seconds = clock.perf_counter() - started
    scored.idempotent = [item.fingerprint for item in result.leaks] == [
        item.fingerprint for item in again.leaks
    ] and [item.estimated_monthly_impact for item in result.leaks] == [
        item.estimated_monthly_impact for item in again.leaks
    ]

    unused = list(result.leaks)
    for expected in customer.expected:
        leak = next((item for item in unused if _matches(expected, item)), None)
        if leak is None:
            scored.false_negatives.append(expected)
            continue
        unused.remove(leak)
        amount_ok = None
        if expected.monthly_impact is not None:
            amount_ok = abs(leak.estimated_monthly_impact - expected.monthly_impact) <= AMOUNT_TOLERANCE
        observed_ok = None
        if expected.observed_total is not None:
            observed = _dec(leak.evidence.get("observed_total_paid"))
            if observed is None:
                observed = _dec(leak.evidence.get("interest_charge_total"))
            observed_ok = observed is not None and abs(observed - expected.observed_total) <= AMOUNT_TOLERANCE
        status_ok = None
        if expected.evidence_status is not None:
            status_ok = leak.evidence.get("evidence_status") == expected.evidence_status
        scored.matches.append(Match(expected, leak, amount_ok, observed_ok, status_ok))
    scored.false_positives = unused

    summary = result.impact_summary
    if summary is not None:
        scored.recurring_total = summary.recurring_monthly_potential
        scored.recurring_before_dedupe = summary.recurring_monthly_before_dedupe
        if customer.expected_recurring_total is not None:
            scored.total_ok = (
                abs(summary.recurring_monthly_potential - customer.expected_recurring_total)
                <= AMOUNT_TOLERANCE
            )
            scored.over_counted = (
                summary.recurring_monthly_potential
                > customer.expected_recurring_total + AMOUNT_TOLERANCE
            )
    return scored


@dataclass
class Metrics:
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0

    @property
    def precision(self) -> float | None:
        total = self.true_positives + self.false_positives
        return None if total == 0 else self.true_positives / total

    @property
    def recall(self) -> float | None:
        total = self.true_positives + self.false_negatives
        return None if total == 0 else self.true_positives / total


def collect_metrics(results: list[CustomerResult]) -> tuple[Metrics, dict[str, Metrics]]:
    overall = Metrics()
    by_type: dict[str, Metrics] = defaultdict(Metrics)
    for item in results:
        for match in item.matches:
            overall.true_positives += 1
            by_type[match.leak.leak_type].true_positives += 1
        for leak in item.false_positives:
            overall.false_positives += 1
            by_type[leak.leak_type].false_positives += 1
        for expected in item.false_negatives:
            overall.false_negatives += 1
            by_type[expected.leak_type].false_negatives += 1
    return overall, dict(by_type)


# A small gold set for the classifier: description, direction, expected class, expected category.
CLASSIFICATION_GOLD: list[tuple[str, str, str, str | None]] = [
    ("NETFLIX.COM", "debit", "spending", "Subscriptions"),
    ("SPOTIFY P1A2B3", "debit", "spending", "Subscriptions"),
    ("WOOLWORTHS CAPE TOWN", "debit", "spending", "Groceries"),
    ("PICK N PAY CONSTANTIA", "debit", "spending", "Groceries"),
    ("KFC SANDTON", "debit", "spending", "Fast Food"),
    ("ENGEN 1 STOP", "debit", "spending", "Fuel"),
    ("UBER *TRIP", "debit", "spending", "Transport"),
    ("MONTHLY ACCOUNT FEE", "debit", "bank_fee", "Bank Fees"),
    ("IMMEDIATE PAYMENT FEE", "debit", "bank_fee", "Bank Fees"),
    ("ATM FEE", "debit", "bank_fee", "Bank Fees"),
    ("OVERDRAFT FEE", "debit", "bank_fee", "Bank Fees"),
    ("INTEREST CHARGED", "debit", "bank_fee", "Bank Fees"),
    ("CREDIT CARD INTEREST", "debit", "bank_fee", "Bank Fees"),
    ("INTERNATIONAL TRANSACTION FEE", "debit", "bank_fee", "Bank Fees"),
    ("SALARY ACME PTY LTD", "credit", "income", None),
    ("INTEREST RECEIVED", "credit", "income", None),
    ("WOOLWORTHS REFUND", "credit", "income", None),
    ("MTN PREPAID AIRTIME", "debit", "spending", "Airtime & Data"),
    ("VODACOM DATA BUNDLE", "debit", "spending", "Airtime & Data"),
    ("DEBIT ORDER DISCOVERY INSURE POLICY 111", "debit", "spending", "Insurance"),
    ("ATM CASH WITHDRAWAL", "debit", "spending", "Cash Withdrawal"),
    ("ZXQ HOLDINGS 4401", "debit", "unknown", None),
]


def classification_accuracy() -> tuple[int, int, list[str]]:
    correct, misses = 0, []
    for description, direction, expected_class, expected_category in CLASSIFICATION_GOLD:
        result = classify_transaction(description, direction)
        class_ok = (result.transaction_class or "unknown") == expected_class
        category_ok = expected_category is None or result.category_name == expected_category
        if class_ok and category_ok:
            correct += 1
        else:
            misses.append(
                f"{description!r}: got {result.transaction_class}/{result.category_name}, "
                f"expected {expected_class}/{expected_category}"
            )
    return correct, len(CLASSIFICATION_GOLD), misses


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def render_report(
    results: list[CustomerResult],
    title: str = "TracePay leak engine benchmark",
    source: str = "tests/benchmark/customers.py",
) -> str:
    overall, by_type = collect_metrics(results)
    amount_checks = [m for r in results for m in r.matches if m.amount_ok is not None]
    observed_checks = [m for r in results for m in r.matches if m.observed_ok is not None]
    status_checks = [m for r in results for m in r.matches if m.status_ok is not None]
    total_checks = [r for r in results if r.total_ok is not None]
    correct, total, misses = classification_accuracy()
    lines = [
        f"# {title}",
        "",
        f"Customers: {len(results)}. Expected findings are defined in `{source}` "
        "before the engine runs and are not adjusted to its output. Findings are scored as the "
        f"customer sees them; {sum(len(r.result.explained_leaks) for r in results)} finding(s) "
        "kept internally as explained by another finding are not counted.",
        "",
        "## Summary",
        "",
        "| Metric | Result |",
        "|---|---|",
        f"| True positives | {overall.true_positives} |",
        f"| False positives | {overall.false_positives} |",
        f"| False negatives | {overall.false_negatives} |",
        f"| Precision | {_pct(overall.precision)} |",
        f"| Recall | {_pct(overall.recall)} |",
        f"| Monthly amount accuracy | {sum(bool(m.amount_ok) for m in amount_checks)}/{len(amount_checks)} |",
        f"| Observed-total accuracy | {sum(bool(m.observed_ok) for m in observed_checks)}/{len(observed_checks)} |",
        f"| Evidence-status accuracy | {sum(bool(m.status_ok) for m in status_checks)}/{len(status_checks)} |",
        f"| Deduplicated total correct | {sum(bool(r.total_ok) for r in total_checks)}/{len(total_checks)} |",
        f"| Double-counting rate (total above expected) | "
        f"{sum(r.over_counted for r in total_checks)}/{len(total_checks)} |",
        f"| Idempotent runs | {sum(r.idempotent for r in results)}/{len(results)} |",
        f"| Classification accuracy (gold set) | {correct}/{total} |",
        f"| Processing time (all customers, twice each) | {sum(r.seconds for r in results):.2f}s |",
        "",
        "## Results by leak category",
        "",
        "| Leak type | TP | FP | FN | Precision | Recall |",
        "|---|---|---|---|---|---|",
    ]
    for leak_type in sorted(by_type):
        item = by_type[leak_type]
        lines.append(
            f"| {leak_type} | {item.true_positives} | {item.false_positives} | {item.false_negatives} "
            f"| {_pct(item.precision)} | {_pct(item.recall)} |"
        )
    lines += ["", "## Customers", ""]
    for item in results:
        customer = item.customer
        lines += [f"### {customer.name} ({customer.covers})", ""]
        if customer.note:
            lines += [customer.note, ""]
        lines.append(
            "Expected: "
            + (
                "; ".join(f"{e.leak_type}/{e.focus or '*'}" for e in customer.expected)
                or "no findings"
            )
        )
        actual = [
            f"{leak.leak_type}/{leak.evidence.get('finding_focus') or '*'} "
            f"(R{leak.estimated_monthly_impact:.2f}, {leak.evidence.get('evidence_status')})"
            for leak in item.result.leaks
        ]
        lines.append("Actual: " + ("; ".join(actual) or "no findings"))
        for match in item.matches:
            flags = []
            if match.amount_ok is False:
                flags.append(
                    f"amount R{match.leak.estimated_monthly_impact:.2f} != expected "
                    f"R{match.expected.monthly_impact:.2f}"
                )
            if match.observed_ok is False:
                flags.append("observed total differs")
            if match.status_ok is False:
                flags.append(
                    f"status {match.leak.evidence.get('evidence_status')} != {match.expected.evidence_status}"
                )
            if flags:
                lines.append(f"- Mismatch on {match.expected.leak_type}: " + ", ".join(flags))
        for expected in item.false_negatives:
            lines.append(f"- MISSED: {expected.leak_type}/{expected.focus or '*'} {expected.subject or ''}".rstrip())
        for leak in item.false_positives:
            lines.append(
                f"- UNEXPECTED: {leak.leak_type}/{leak.evidence.get('finding_focus') or '*'} "
                f"R{leak.estimated_monthly_impact:.2f}"
            )
        if customer.expected_recurring_total is not None:
            lines.append(
                f"- Recurring monthly total: R{item.recurring_total:.2f} after overlaps "
                f"(R{item.recurring_before_dedupe:.2f} before), expected R{customer.expected_recurring_total:.2f}"
            )
        lines.append("")
    lines += ["## Classification misses", ""]
    lines += [f"- {miss}" for miss in misses] or ["None."]
    lines.append("")
    return "\n".join(lines)


def run_all(customers: list[Customer] | None = None) -> list[CustomerResult]:
    return [score_customer(customer) for customer in (customers or build_customers())]


def run_noisy() -> list[CustomerResult]:
    from tests.benchmark.noisy_customers import build_noisy_customers

    return run_all(build_noisy_customers())


if __name__ == "__main__":
    # `python -m tests.benchmark.runner [tidy-report.md [noisy-report.md]]`
    suites = [
        ("TracePay leak engine benchmark", "tests/benchmark/customers.py", run_all),
        (
            "TracePay leak engine benchmark: noisy, independent data",
            "tests/benchmark/noisy_customers.py",
            run_noisy,
        ),
    ]
    sys.stdout.reconfigure(encoding="utf-8")
    for index, (title, source, runner) in enumerate(suites):
        report = render_report(runner(), title, source)
        if len(sys.argv) > index + 1:
            target = Path(sys.argv[index + 1])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(report, encoding="utf-8")
        print(report)
