"""What the uploaded statements actually cover, per account and overall.

Coverage comes from statement metadata and extracted contents, never from a
file name. Three situations are kept apart because they mean different things:

``confirmed_missing``
    Two statements of one account leave a gap AND the earlier closing balance
    does not equal the later opening balance, so money demonstrably moved in
    the gap.
``balances_continuous``
    A gap exists but the balances join up exactly, so nothing moved in it.
``not_uploaded``
    A gap exists and the balances cannot say either way (a balance is
    missing). The activity is unknown, not proven absent.

A period that was only inferred from the first and last extracted transaction
is not evidence for the days at its edges, and is reported as such.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Literal, Mapping, Sequence

from pydantic import BaseModel, Field

from .import_quality import StatementImportQuality

BALANCE_TOLERANCE = Decimal("0.05")
MAX_PLAUSIBLE_PERIOD_DAYS = 366
LOW_EXTRACTION_CONFIDENCE = Decimal("0.65")

GapKind = Literal["confirmed_missing", "balances_continuous", "not_uploaded"]
IssueKind = Literal[
    "failed",
    "opening_closing_mismatch",
    "balance_chain_mismatch",
    "low_extraction_confidence",
    "rows_rejected",
    "period_inferred",
    "period_inconsistent",
    "transactions_outside_period",
    "account_unconfirmed",
]


class StatementRecord(BaseModel):
    """One statement import, reduced to what coverage needs."""

    id: str
    account_id: str | None = None
    status: str = "processed"
    start: date | None = None
    end: date | None = None
    period_source: Literal["declared", "inferred", "unknown"] | None = None
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None
    transaction_count: int = 0
    rows_detected: int | None = None
    rows_rejected: int | None = None
    extraction_confidence: Decimal | None = None
    balance_reconciliation: str | None = None
    opening_closing_reconciliation: str | None = None
    reconciliation_difference: Decimal | None = None
    extracted_last4: str | None = None
    first_transaction_date: date | None = None
    last_transaction_date: date | None = None
    transactions_outside_period: int = 0
    warnings: list[str] = Field(default_factory=list)
    # Display only. Coverage is never inferred from a file name.
    file_name: str | None = None


class AccountRecord(BaseModel):
    account_id: str
    name: str | None = None
    bank_key: str | None = None
    institution: str | None = None
    last4: str | None = None

    @property
    def label(self) -> str:
        bank = self.institution or self.name or "Account"
        return f"{bank} ••{self.last4}" if self.last4 else bank


class StatementIssue(BaseModel):
    statement_id: str
    kind: IssueKind
    message: str
    severity: Literal["info", "warning", "error"] = "warning"


class CoveragePeriod(BaseModel):
    statement_id: str
    start: date
    end: date
    period_source: Literal["declared", "inferred", "unknown"]
    transaction_count: int
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None


class CoverageGap(BaseModel):
    account_id: str
    start: date
    end: date
    days: int
    kind: GapKind
    balance_difference: Decimal | None = None
    message: str


class CoverageOverlap(BaseModel):
    account_id: str
    statement_ids: tuple[str, str]
    start: date
    end: date
    days: int


class AccountCoverage(BaseModel):
    account_id: str
    label: str
    bank_key: str | None = None
    statement_count: int = 0
    periods: list[CoveragePeriod] = Field(default_factory=list)
    covered_ranges: list[tuple[date, date]] = Field(default_factory=list)
    gaps: list[CoverageGap] = Field(default_factory=list)
    overlaps: list[CoverageOverlap] = Field(default_factory=list)
    issues: list[StatementIssue] = Field(default_factory=list)
    first_covered: date | None = None
    last_covered: date | None = None
    has_statements: bool = False


class CoverageLimit(BaseModel):
    """Something about coverage that limits how far a finding can be trusted."""

    kind: Literal[
        "confirmed_missing",
        "not_uploaded",
        "account_without_statements",
        "statement_issue",
        "range_not_covered",
    ]
    account_id: str | None = None
    account_label: str | None = None
    start: date | None = None
    end: date | None = None
    message: str
    materially_limits: bool = True


class StatementCoverage(BaseModel):
    accounts: list[AccountCoverage] = Field(default_factory=list)
    overall_start: date | None = None
    overall_end: date | None = None
    total_statements: int = 0
    failed_statements: int = 0
    summary: list[str] = Field(default_factory=list)
    disclaimer: str = (
        "TracePay can only analyse activity that appears in the statements you upload. "
        "Adding statements for every account and month makes the results more reliable, "
        "but activity that is not in an uploaded statement cannot be detected."
    )


# --------------------------------------------------------------------- parsing


def _optional_decimal(value: Any) -> Decimal | None:
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return number if number.is_finite() else None


def _optional_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and len(value) >= 10:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _optional_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return max(int(value), 0)
    except (TypeError, ValueError):
        return None


def statement_record_from_row(
    row: Mapping[str, Any],
    *,
    first_transaction: date | None = None,
    last_transaction: date | None = None,
    outside_period: int = 0,
) -> StatementRecord | None:
    statement_id = row.get("id")
    if not isinstance(statement_id, str) or not statement_id:
        return None
    period_source = row.get("period_source")
    warnings = row.get("extraction_warnings")
    return StatementRecord(
        id=statement_id,
        account_id=row.get("account_id") if isinstance(row.get("account_id"), str) else None,
        status=str(row.get("status") or "processed"),
        start=_optional_date(row.get("statement_start_date")),
        end=_optional_date(row.get("statement_end_date")),
        period_source=period_source if period_source in {"declared", "inferred", "unknown"} else None,
        opening_balance=_optional_decimal(row.get("opening_balance")),
        closing_balance=_optional_decimal(row.get("closing_balance")),
        transaction_count=_optional_int(row.get("transaction_count")) or 0,
        rows_detected=_optional_int(row.get("rows_detected")),
        rows_rejected=_optional_int(row.get("rows_rejected")),
        extraction_confidence=_optional_decimal(row.get("extraction_confidence")),
        balance_reconciliation=row.get("balance_reconciliation")
        if isinstance(row.get("balance_reconciliation"), str)
        else None,
        opening_closing_reconciliation=row.get("opening_closing_reconciliation")
        if isinstance(row.get("opening_closing_reconciliation"), str)
        else None,
        reconciliation_difference=_optional_decimal(row.get("reconciliation_difference")),
        extracted_last4=row.get("extracted_last4") if isinstance(row.get("extracted_last4"), str) else None,
        first_transaction_date=first_transaction,
        last_transaction_date=last_transaction,
        transactions_outside_period=outside_period,
        warnings=[w for w in warnings if isinstance(w, str)] if isinstance(warnings, list) else [],
        file_name=row.get("file_name") if isinstance(row.get("file_name"), str) else None,
    )


# ----------------------------------------------------------------- computation


def _effective_period(record: StatementRecord) -> tuple[date, date, str] | None:
    """The days this statement can vouch for, with how that was established."""
    if record.status != "processed" or record.start is None or record.end is None:
        return None
    if record.start > record.end:
        return None
    source = record.period_source
    if source is None:
        # Imports from before provenance was recorded: a period equal to the
        # first/last transaction was almost certainly inferred from them.
        inferred = (
            record.first_transaction_date == record.start
            and record.last_transaction_date == record.end
        )
        source = "inferred" if inferred else "unknown"
    if source == "inferred":
        # Only the days between the first and last extracted transaction.
        start = record.first_transaction_date or record.start
        end = record.last_transaction_date or record.end
        return start, end, "inferred"
    return record.start, record.end, source


def _quality(record: StatementRecord) -> StatementImportQuality:
    return StatementImportQuality(
        import_id=record.id,
        balance_reconciliation=record.balance_reconciliation,
        rows_detected=record.rows_detected,
        rows_rejected=record.rows_rejected,
        extraction_confidence=record.extraction_confidence,
        statement_start_date=record.start,
        statement_end_date=record.end,
    )


def _issues(record: StatementRecord, account_known: bool) -> list[StatementIssue]:
    issues: list[StatementIssue] = []
    if record.status == "failed":
        issues.append(
            StatementIssue(
                statement_id=record.id,
                kind="failed",
                severity="error",
                message="This statement could not be read, so its period is not covered.",
            )
        )
        return issues
    if record.status != "processed":
        return issues
    if record.start is not None and record.end is not None:
        if record.start > record.end:
            issues.append(
                StatementIssue(
                    statement_id=record.id,
                    kind="period_inconsistent",
                    severity="error",
                    message="The statement's start date is after its end date. Check the statement.",
                )
            )
        elif (record.end - record.start).days > MAX_PLAUSIBLE_PERIOD_DAYS:
            issues.append(
                StatementIssue(
                    statement_id=record.id,
                    kind="period_inconsistent",
                    message="The statement period is longer than a year, which is unusual. Check the dates.",
                )
            )
    if record.transactions_outside_period > 0:
        issues.append(
            StatementIssue(
                statement_id=record.id,
                kind="transactions_outside_period",
                message=(
                    f"{record.transactions_outside_period} transaction(s) are dated outside the "
                    "statement's own period, so the period or the dates may be misread."
                ),
            )
        )
    if record.opening_closing_reconciliation == "mismatch":
        difference = record.reconciliation_difference
        detail = f" (difference {difference:,.2f})" if difference is not None else ""
        issues.append(
            StatementIssue(
                statement_id=record.id,
                kind="opening_closing_mismatch",
                message=(
                    "Opening balance plus the extracted transactions does not equal the closing "
                    f"balance{detail}. Some activity may be missing or misread."
                ),
            )
        )
    if record.balance_reconciliation == "mismatch":
        issues.append(
            StatementIssue(
                statement_id=record.id,
                kind="balance_chain_mismatch",
                message="Running balances do not add up across the extracted rows.",
            )
        )
    if (
        record.extraction_confidence is not None
        and record.extraction_confidence < LOW_EXTRACTION_CONFIDENCE
    ):
        issues.append(
            StatementIssue(
                statement_id=record.id,
                kind="low_extraction_confidence",
                message="Extraction confidence was low; review this statement.",
            )
        )
    if (
        record.rows_detected
        and record.rows_rejected
        and record.rows_rejected / record.rows_detected >= 0.2
    ):
        issues.append(
            StatementIssue(
                statement_id=record.id,
                kind="rows_rejected",
                message=(
                    f"{record.rows_rejected} of {record.rows_detected} transaction-like rows "
                    "could not be read safely."
                ),
            )
        )
    if _effective_period(record) is not None and _effective_period(record)[2] == "inferred":  # type: ignore[index]
        issues.append(
            StatementIssue(
                statement_id=record.id,
                kind="period_inferred",
                severity="info",
                message=(
                    "The statement did not print its period, so coverage is limited to the dates of "
                    "the transactions found; activity at the start and end of the month is unverified."
                ),
            )
        )
    if not account_known:
        issues.append(
            StatementIssue(
                statement_id=record.id,
                kind="account_unconfirmed",
                message="This statement is not linked to an account. Choose its account to count it.",
            )
        )
    return issues


def _merge(ranges: Iterable[tuple[date, date]]) -> list[tuple[date, date]]:
    merged: list[tuple[date, date]] = []
    for start, end in sorted(ranges):
        if merged and start <= merged[-1][1] + timedelta(days=1):
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _classify_gap(
    account_id: str,
    before: StatementRecord,
    after: StatementRecord,
    start: date,
    end: date,
) -> CoverageGap:
    days = (end - start).days + 1
    closing, opening = before.closing_balance, after.opening_balance
    if closing is None or opening is None:
        return CoverageGap(
            account_id=account_id,
            start=start,
            end=end,
            days=days,
            kind="not_uploaded",
            message=(
                f"No statement covers {start:%d %b %Y} to {end:%d %b %Y}. Activity in those "
                f"{days} day(s) is unknown."
            ),
        )
    difference = opening - closing
    if abs(difference) <= BALANCE_TOLERANCE:
        return CoverageGap(
            account_id=account_id,
            start=start,
            end=end,
            days=days,
            kind="balances_continuous",
            balance_difference=Decimal("0"),
            message=(
                f"{start:%d %b %Y} to {end:%d %b %Y} is not covered by a statement, but the "
                "balances before and after match, so no money moved."
            ),
        )
    return CoverageGap(
        account_id=account_id,
        start=start,
        end=end,
        days=days,
        kind="confirmed_missing",
        balance_difference=difference,
        message=(
            f"A statement for {start:%d %b %Y} to {end:%d %b %Y} is missing: the balance changed by "
            f"{difference:,.2f} between the statements either side."
        ),
    )


def build_coverage(
    statements: Sequence[StatementRecord],
    accounts: Sequence[AccountRecord],
) -> StatementCoverage:
    """Per-account periods, gaps, overlaps and issues, plus an overall summary."""
    by_account: dict[str, list[StatementRecord]] = defaultdict(list)
    unassigned: list[StatementRecord] = []
    for record in statements:
        if record.account_id:
            by_account[record.account_id].append(record)
        else:
            unassigned.append(record)

    known = {account.account_id: account for account in accounts}
    results: list[AccountCoverage] = []
    overall_ranges: list[tuple[date, date]] = []

    for account_id in sorted(set(known) | set(by_account)):
        account = known.get(account_id) or AccountRecord(account_id=account_id)
        records = sorted(
            by_account.get(account_id, []),
            key=lambda r: (r.start or date.max, r.end or date.max, r.id),
        )
        coverage = AccountCoverage(
            account_id=account_id,
            label=account.label,
            bank_key=account.bank_key,
            statement_count=sum(1 for r in records if r.status == "processed"),
            has_statements=any(r.status == "processed" for r in records),
        )
        usable: list[tuple[StatementRecord, date, date, str]] = []
        for record in records:
            coverage.issues.extend(_issues(record, account_known=True))
            effective = _effective_period(record)
            if effective is None:
                continue
            start, end, source = effective
            usable.append((record, start, end, source))
            coverage.periods.append(
                CoveragePeriod(
                    statement_id=record.id,
                    start=start,
                    end=end,
                    period_source=source,  # type: ignore[arg-type]
                    transaction_count=record.transaction_count,
                    opening_balance=record.opening_balance,
                    closing_balance=record.closing_balance,
                )
            )
        coverage.covered_ranges = _merge((start, end) for _, start, end, _ in usable)
        if coverage.covered_ranges:
            coverage.first_covered = coverage.covered_ranges[0][0]
            coverage.last_covered = coverage.covered_ranges[-1][1]
            overall_ranges.extend(coverage.covered_ranges)

        # Overlaps between statements of the same account.
        for index, (first, f_start, f_end, _) in enumerate(usable):
            for second, s_start, s_end, _ in usable[index + 1 :]:
                overlap_start, overlap_end = max(f_start, s_start), min(f_end, s_end)
                if overlap_start <= overlap_end:
                    coverage.overlaps.append(
                        CoverageOverlap(
                            account_id=account_id,
                            statement_ids=(first.id, second.id),
                            start=overlap_start,
                            end=overlap_end,
                            days=(overlap_end - overlap_start).days + 1,
                        )
                    )

        # Gaps between merged ranges, classified with the adjacent balances.
        for (_, merged_end), (merged_next_start, _) in zip(
            coverage.covered_ranges, coverage.covered_ranges[1:]
        ):
            gap_start, gap_end = merged_end + timedelta(days=1), merged_next_start - timedelta(days=1)
            if gap_start > gap_end:
                continue
            before = max(
                (item for item in usable if item[2] == merged_end),
                key=lambda item: (item[1], item[0].id),
            )[0]
            after = min(
                (item for item in usable if item[1] == merged_next_start),
                key=lambda item: (item[2], item[0].id),
            )[0]
            coverage.gaps.append(_classify_gap(account_id, before, after, gap_start, gap_end))
        results.append(coverage)

    unassigned_issues = [
        issue for record in unassigned for issue in _issues(record, account_known=False)
    ]
    if unassigned_issues:
        results.append(
            AccountCoverage(
                account_id="unassigned",
                label="Statements not linked to an account",
                issues=unassigned_issues,
            )
        )

    failed = sum(1 for record in statements if record.status == "failed")
    coverage_all = StatementCoverage(
        accounts=results,
        total_statements=sum(1 for record in statements if record.status == "processed"),
        failed_statements=failed,
    )
    if overall_ranges:
        coverage_all.overall_start = min(start for start, _ in overall_ranges)
        coverage_all.overall_end = max(end for _, end in overall_ranges)
    coverage_all.summary = _summary(coverage_all)
    return coverage_all


def _summary(coverage: StatementCoverage) -> list[str]:
    lines: list[str] = []
    accounts_with = [a for a in coverage.accounts if a.has_statements]
    without = [a for a in coverage.accounts if not a.has_statements and a.account_id != "unassigned"]
    if accounts_with:
        lines.append(
            f"{len(accounts_with)} account(s) covered by {coverage.total_statements} statement(s)."
        )
    for account in without:
        lines.append(f"{account.label} has no statements yet; its activity cannot be analysed.")
    confirmed = sum(1 for a in coverage.accounts for g in a.gaps if g.kind == "confirmed_missing")
    unknown = sum(1 for a in coverage.accounts for g in a.gaps if g.kind == "not_uploaded")
    if confirmed:
        lines.append(f"{confirmed} period(s) confirmed missing by the balances.")
    if unknown:
        lines.append(f"{unknown} period(s) have no statement, so their activity is unknown.")
    if coverage.failed_statements:
        lines.append(f"{coverage.failed_statements} statement(s) could not be read.")
    return lines


# ---------------------------------------------------------------- finding limits


def coverage_limits_for_range(
    coverage: StatementCoverage,
    account_ids: Iterable[str],
    start: date | None,
    end: date | None,
) -> list[CoverageLimit]:
    """Coverage gaps that limit confidence in a finding over ``[start, end]``.

    Only accounts that contribute evidence are checked for gaps and issues. All
    other accounts matter only when they have no statements at all, because
    activity there cannot be seen and could change the picture.
    """
    involved = set(account_ids)
    limits: list[CoverageLimit] = []
    by_id = {account.account_id: account for account in coverage.accounts}

    for account_id in sorted(involved):
        account = by_id.get(account_id)
        if account is None:
            continue
        for gap in account.gaps:
            if start is not None and end is not None and (gap.end < start or gap.start > end):
                continue
            if gap.kind == "balances_continuous":
                continue
            limits.append(
                CoverageLimit(
                    kind=gap.kind,  # type: ignore[arg-type]
                    account_id=account_id,
                    account_label=account.label,
                    start=gap.start,
                    end=gap.end,
                    message=gap.message,
                )
            )
        if start is not None and end is not None and account.covered_ranges:
            if not any(r_start <= start and end <= r_end for r_start, r_end in account.covered_ranges):
                # Not one continuous covered range; gaps above explain the inside,
                # this covers the edges.
                if start < (account.first_covered or start):
                    limits.append(
                        CoverageLimit(
                            kind="range_not_covered",
                            account_id=account_id,
                            account_label=account.label,
                            start=start,
                            end=(account.first_covered or start) - timedelta(days=1),
                            message=(
                                f"{account.label}: no statement covers the start of this period "
                                f"(coverage begins {account.first_covered:%d %b %Y})."
                            ),
                            materially_limits=False,
                        )
                    )
                if end > (account.last_covered or end):
                    limits.append(
                        CoverageLimit(
                            kind="range_not_covered",
                            account_id=account_id,
                            account_label=account.label,
                            start=(account.last_covered or end) + timedelta(days=1),
                            end=end,
                            message=(
                                f"{account.label}: no statement covers the end of this period "
                                f"(coverage ends {account.last_covered:%d %b %Y})."
                            ),
                            materially_limits=False,
                        )
                    )
        for issue in account.issues:
            if issue.severity == "info":
                continue
            limits.append(
                CoverageLimit(
                    kind="statement_issue",
                    account_id=account_id,
                    account_label=account.label,
                    message=f"{account.label}: {issue.message}",
                    materially_limits=issue.kind
                    in {"failed", "opening_closing_mismatch", "balance_chain_mismatch", "rows_rejected"},
                )
            )

    for account in coverage.accounts:
        if account.account_id in involved or account.account_id == "unassigned":
            continue
        if not account.has_statements:
            limits.append(
                CoverageLimit(
                    kind="account_without_statements",
                    account_id=account.account_id,
                    account_label=account.label,
                    message=(
                        f"{account.label} has no uploaded statements, so any activity there "
                        "(including matching charges or transfers) is not visible."
                    ),
                    materially_limits=False,
                )
            )
    return limits
