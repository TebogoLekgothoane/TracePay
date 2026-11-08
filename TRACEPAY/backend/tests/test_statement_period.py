"""The review period taken from printed statement dates, for any statement cycle."""

from datetime import date

from leak_intelligence.statement_review import context_from_printed_figures


def _rows(*dates: str) -> list[dict[str, object]]:
    return [{"account_id": "acc-1", "printed_figures": {"statement_date": day}} for day in dates]


def _months(start: date, end: date) -> int:
    return max(1, round((end - start).days / 30.4))


def test_cycle_ending_on_the_4th_starts_a_month_before_the_first_statement() -> None:
    ctx = context_from_printed_figures(_rows("2026-04-04", "2026-05-04", "2026-06-04"))

    assert ctx.period_start == date(2026, 3, 5)
    assert ctx.period_end == date(2026, 6, 4)
    # Three statements are three months, not two.
    assert _months(ctx.period_start, ctx.period_end) == 3


def test_calendar_month_statements_start_on_the_first() -> None:
    ctx = context_from_printed_figures(_rows("2026-06-30", "2026-10-31"))

    assert ctx.period_start == date(2026, 6, 1)
    assert ctx.period_end == date(2026, 10, 31)


def test_cycle_in_january_starts_in_december_of_the_year_before() -> None:
    ctx = context_from_printed_figures(_rows("2026-01-15", "2026-02-15"))

    assert ctx.period_start == date(2025, 12, 16)


def test_cycle_on_the_31st_after_a_short_month_does_not_overflow() -> None:
    # 30 Mar is not a month-end; the previous month (Feb) has 28 days, so the cycle began 1 Mar.
    ctx = context_from_printed_figures(_rows("2026-03-30", "2026-04-30"))

    assert ctx.period_start == date(2026, 3, 1)
