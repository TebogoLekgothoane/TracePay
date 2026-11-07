from datetime import date
from decimal import Decimal
from pathlib import Path

from categorisation.models import CategorisationResult
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.statement_review import (
    StatementContext,
    build_statement_review,
    money,
    money_list,
)
from leak_intelligence.statement_review_render import render_statement_review
from tests.statement_review_helpers import investec_context, investec_transactions

GOLDEN = Path(__file__).parent / "fixtures" / "statement_review" / "investec_8379_report.md"


def _tx(
    n: int,
    when: date,
    amount: str,
    description: str,
    *,
    kind: str = "debit",
    klass: str = "spending",
    merchant: str | None = None,
) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=f"t{n}",
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        description=description,
        merchant_name=merchant,
        transaction_type=kind,  # type: ignore[arg-type]
        categorisation=CategorisationResult(
            category_name="Other",
            category_confidence=0.9,
            transaction_class=klass,  # type: ignore[arg-type]
            classification_confidence=0.9,
            merchant_name=merchant,
        ),
    )


def _monthly(name: str, amounts: list[str], months: list[int], day: int = 1) -> list[FeatureTransaction]:
    return [
        _tx(1000 * month + index, date(2026, month, day), amount, name, merchant=name)
        for index, (month, amount) in enumerate(zip(months, amounts))
    ]


def _report(txs: list[FeatureTransaction], ctx: StatementContext | None = None):
    return build_statement_review(txs, ctx)


# ---------------------------------------------------------------------------- the five statements


def test_investec_report_matches_the_agreed_report_exactly() -> None:
    review = build_statement_review(investec_transactions(), investec_context())
    assert render_statement_review(review) == GOLDEN.read_text(encoding="utf-8")


def test_investec_findings_land_in_the_agreed_groups() -> None:
    review = build_statement_review(investec_transactions(), investec_context())
    groups = {item.key: item.group for item in review.findings}
    assert groups["double_debit:Virgin Active"] == "recoverable"
    assert groups["paired:Apple"] == "recoverable"
    assert groups["price_drop:Pineapple"] == "good_news"
    # Nothing is both a double debit and a price rise.
    assert "price_rise:Virgin Active" not in groups
    assert "unknown_recurring:Propup" in groups


def test_investec_reconciles_to_every_statement() -> None:
    review = build_statement_review(investec_transactions(), investec_context())
    assert review.reconciliation and "to the cent, in all 5 months" in review.reconciliation


def test_money_out_and_in_match_four_months_and_the_fifth_is_explained_exactly() -> None:
    reconciliation = build_statement_review(investec_transactions(), investec_context()).reconciliation
    assert reconciliation is not None
    assert "add up to the statement totals to the cent in 4 of 5 months." in reconciliation
    assert (
        "In September the rows are R1,281.11 higher than the statement totals on both sides. "
        "That is the R1,281.11 InvestecPB ACC 3 transfer on 11 Sep, returned on 15 Sep: "
        "the bank leaves both out of its totals."
    ) in reconciliation
    assert "does not add up" not in reconciliation


def test_a_gap_nothing_explains_is_reported_not_smoothed_over() -> None:
    ctx = investec_context()
    wrong = StatementContext(
        account_label=ctx.account_label,
        period_start=ctx.period_start,
        period_end=ctx.period_end,
        statement_debit_totals={**ctx.statement_debit_totals, "2026-08": Decimal("1.00")},
        statement_credit_totals=ctx.statement_credit_totals,
    )
    reconciliation = build_statement_review(investec_transactions(), wrong).reconciliation
    assert reconciliation is not None
    assert "does not add up to the statement totals for August" in reconciliation
    assert "rows may be missing or repeated in those months" in reconciliation


def test_a_gap_on_one_side_only_is_never_called_a_returned_item() -> None:
    # September's money out is off by R1,281.11 but money in is right: not a returned pair.
    ctx = investec_context()
    wrong = StatementContext(
        account_label=ctx.account_label,
        period_start=ctx.period_start,
        period_end=ctx.period_end,
        statement_debit_totals=ctx.statement_debit_totals,
        statement_credit_totals={**ctx.statement_credit_totals, "2026-09": ctx.statement_credit_totals["2026-09"] + Decimal("1281.11")},
    )
    reconciliation = build_statement_review(investec_transactions(), wrong).reconciliation
    assert reconciliation is not None and "does not add up to the statement totals for September" in reconciliation
    assert "returned on" not in reconciliation


# ---------------------------------------------------------------------------- formatting


def test_money_drops_empty_cents_and_money_list_lines_prices_up() -> None:
    assert money(835) == "R835"
    assert money("1670.00") == "R1,670"
    assert money("2065.46") == "R2,065.46"
    assert money_list([Decimal("1889.99"), Decimal("579.00")]) == "R1,889.99 and R579.00"
    assert money_list([Decimal("835"), Decimal("1670")]) == "R835 and R1,670"


# ---------------------------------------------------------------------------- double debit


def test_a_doubled_debit_is_raised_when_no_month_was_missed() -> None:
    txs = _monthly("VIRGIN ACT NETCASH", ["835", "835", "835", "835", "1670"], [6, 7, 8, 9, 10])
    keys = {item.key for item in _report(txs).findings}
    assert "double_debit:Virgin Active" in keys


def test_missed_months_billed_together_are_not_a_double_debit() -> None:
    # August was never paid, so a double in September is the missed month catching up.
    txs = _monthly("VIRGIN ACT NETCASH", ["835", "835", "835", "1670"], [5, 6, 7, 9])
    keys = {item.key for item in _report(txs).findings}
    assert not any(key.startswith("double_debit") for key in keys)


# ---------------------------------------------------------------------------- paired charges


def _pair(month: int) -> list[FeatureTransaction]:
    return [
        _tx(month * 10, date(2026, month, 27), "199.99", "APPLE.COM/BILL ITUNES.COM IE", merchant="Apple"),
        _tx(month * 10 + 1, date(2026, month, 29), "199.99", "APPLE.COM/BILL ITUNES.COM IE", merchant="Apple"),
    ]


def test_the_same_charge_twice_in_one_month_only_is_not_raised() -> None:
    assert not [item for item in _report(_pair(6)).findings if item.key.startswith("paired")]


def test_the_same_charge_twice_in_two_months_is_raised() -> None:
    findings = [item for item in _report([*_pair(6), *_pair(7)]).findings if item.key.startswith("paired")]
    assert len(findings) == 1
    assert findings[0].figures["pairs"] == 2
    assert findings[0].figures["extra"] == Decimal("399.98")


# ---------------------------------------------------------------------------- price changes


def test_a_price_rise_is_reviewed_and_a_price_drop_is_good_news() -> None:
    rise = _monthly("DOTSURE", ["678.62"] * 4 + ["814.34"], [6, 7, 8, 9, 10], day=24)
    drop = _monthly("PINEAPPLE", ["1054.66"] * 4 + ["676.23"], [6, 7, 8, 9, 10], day=30)
    review = _report([*rise, *drop])
    by_key = {item.key: item for item in review.findings}
    assert by_key["price_rise:Dotsure"].group == "review"
    assert "+R135.72/month, +20%" in by_key["price_rise:Dotsure"].shows
    assert by_key["price_drop:Pineapple"].group == "good_news"
    assert "R378.43/month less" in by_key["price_drop:Pineapple"].line


def test_a_rounding_sized_change_is_not_a_price_rise() -> None:
    txs = _monthly("DISCBANK", ["2580.10"] * 4 + ["2565.75"], [6, 7, 8, 9, 10], day=25)
    assert not [item for item in _report(txs).findings if item.key.startswith("price_")]


# ---------------------------------------------------------------------------- never states what it was not given


def test_without_statement_figures_no_rate_limit_or_escalation_is_stated() -> None:
    review = build_statement_review(investec_transactions())  # no context at all
    text = render_statement_review(review)
    assert "The rate went" not in text
    assert "implies an average overdraft" not in text
    assert "overdraft facility" not in text
    assert "credit rate" not in text
    assert "Spending escalation" not in text
    assert "add up to each statement's own totals" not in text
    # What the rows alone show is still there.
    assert "R2,065.46 over 5 months" in text
    assert "Virgin Active charged double" in text


def test_a_mismatch_with_a_statement_total_is_reported_not_hidden() -> None:
    ctx = investec_context()
    wrong = StatementContext(
        account_label=ctx.account_label,
        period_start=ctx.period_start,
        period_end=ctx.period_end,
        statement_fee_totals={**ctx.statement_fee_totals, "2026-08": Decimal("1.00")},
    )
    review = build_statement_review(investec_transactions(), wrong)
    assert review.reconciliation and "August" in review.reconciliation
    assert "do not add up" in review.reconciliation


def test_groups_are_never_merged_into_a_total() -> None:
    text = render_statement_review(build_statement_review(investec_transactions(), investec_context()))
    assert 'Nothing below is added into one "money lost" figure.' in text
