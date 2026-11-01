"""Fail when a change costs the leak engine precision or recall on any leak type.

The customers and their expected findings live in ``tests/benchmark`` and are
written before the engine runs. Regenerate the reports after an intended change:

    python -m tests.benchmark.runner docs/leak-benchmark-report.md docs/leak-benchmark-noisy-report.md
"""

from __future__ import annotations

from tests.benchmark.runner import collect_metrics, run_all, run_noisy

# Findings the noisy suite is known to return that no analyst expected. Fixing one
# lowers the count; the test then asks for this table to be tightened.
KNOWN_NOISY_FALSE_POSITIVES = {"transport_spending_leak": 1}


def _describe(results) -> str:
    lines = []
    for item in results:
        lines += [f"{item.customer.name}: MISSED {e.leak_type}/{e.focus}" for e in item.false_negatives]
        lines += [
            f"{item.customer.name}: UNEXPECTED {leak.leak_type}/{leak.evidence.get('finding_focus')}"
            for leak in item.false_positives
        ]
    return "\n".join(lines)


def test_tidy_benchmark_has_perfect_precision_and_recall_for_every_type() -> None:
    results = run_all()
    overall, by_type = collect_metrics(results)
    assert overall.false_positives == 0 and overall.false_negatives == 0, _describe(results)
    for leak_type, metrics in by_type.items():
        assert metrics.precision == 1.0 and metrics.recall == 1.0, leak_type


def test_tidy_benchmark_amounts_statuses_and_totals_are_right() -> None:
    for item in run_all():
        for match in item.matches:
            assert match.amount_ok is not False, f"{item.customer.name}: amount"
            assert match.observed_ok is not False, f"{item.customer.name}: observed total"
            assert match.status_ok is not False, f"{item.customer.name}: evidence status"
        assert item.total_ok is not False, f"{item.customer.name}: deduplicated total"
        assert not item.over_counted, f"{item.customer.name}: double counted"
        assert item.idempotent, f"{item.customer.name}: not idempotent"


def test_noisy_benchmark_finds_everything_and_adds_no_new_false_positives() -> None:
    results = run_noisy()
    _, by_type = collect_metrics(results)
    for leak_type, metrics in by_type.items():
        assert metrics.recall in (1.0, None), f"{leak_type} recall\n{_describe(results)}"
        allowed = KNOWN_NOISY_FALSE_POSITIVES.get(leak_type, 0)
        assert metrics.false_positives <= allowed, f"{leak_type} false positives\n{_describe(results)}"
    for leak_type, allowed in KNOWN_NOISY_FALSE_POSITIVES.items():
        actual = by_type.get(leak_type)
        assert actual is not None and actual.false_positives == allowed, (
            f"{leak_type} no longer has {allowed} false positive(s): lower KNOWN_NOISY_FALSE_POSITIVES"
        )
    assert all(item.idempotent for item in results)
