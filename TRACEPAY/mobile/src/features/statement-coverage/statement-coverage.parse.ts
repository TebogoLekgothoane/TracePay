import type {
  AccountCoverage,
  CoverageGap,
  CoverageIssue,
  CoverageOverlap,
  CoveragePeriod,
  CoverageStatement,
  GapKind,
  PeriodSource,
  StatementCoverage,
} from "./statement-coverage.types";

export class StatementCoverageApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "StatementCoverageApiError";
    this.status = status;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const GAP_KINDS = new Set<GapKind>(["confirmed_missing", "balances_continuous", "not_uploaded"]);
const PERIOD_SOURCES = new Set<PeriodSource>(["declared", "inferred", "unknown"]);
const ISSUE_KINDS = new Set([
  "failed",
  "opening_closing_mismatch",
  "balance_chain_mismatch",
  "low_extraction_confidence",
  "rows_rejected",
  "period_inferred",
  "period_inconsistent",
  "transactions_outside_period",
  "account_unconfirmed",
]);

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function isoDate(value: unknown): string | null {
  return typeof value === "string" && ISO_DATE.test(value) ? value : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function list<T>(value: unknown, read: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const parsed = read(item);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

function readPeriod(value: unknown): CoveragePeriod | null {
  if (!isObject(value)) return null;
  const start = isoDate(value.start);
  const end = isoDate(value.end);
  const source = value.period_source;
  if (!start || !end || typeof source !== "string" || !PERIOD_SOURCES.has(source as PeriodSource)) {
    return null;
  }
  return {
    statementId: text(value.statement_id),
    start,
    end,
    periodSource: source as PeriodSource,
    transactionCount: count(value.transaction_count),
  };
}

function readGap(value: unknown): CoverageGap | null {
  if (!isObject(value)) return null;
  const start = isoDate(value.start);
  const end = isoDate(value.end);
  const kind = value.kind;
  if (!start || !end || typeof kind !== "string" || !GAP_KINDS.has(kind as GapKind)) return null;
  const difference =
    value.balance_difference === null || value.balance_difference === undefined
      ? null
      : Number(value.balance_difference);
  return {
    accountId: text(value.account_id),
    start,
    end,
    days: count(value.days),
    kind: kind as GapKind,
    balanceDifference: difference !== null && Number.isFinite(difference) ? difference : null,
    message: text(value.message),
  };
}

function readOverlap(value: unknown): CoverageOverlap | null {
  if (!isObject(value)) return null;
  const start = isoDate(value.start);
  const end = isoDate(value.end);
  if (!start || !end) return null;
  return { accountId: text(value.account_id), start, end, days: count(value.days) };
}

function readIssue(value: unknown): CoverageIssue | null {
  if (!isObject(value) || typeof value.kind !== "string" || !ISSUE_KINDS.has(value.kind)) return null;
  const severity = value.severity === "info" || value.severity === "error" ? value.severity : "warning";
  return {
    statementId: text(value.statement_id),
    kind: value.kind as CoverageIssue["kind"],
    message: text(value.message),
    severity,
  };
}

function readRange(value: unknown): { start: string; end: string } | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const start = isoDate(value[0]);
  const end = isoDate(value[1]);
  return start && end ? { start, end } : null;
}

function readAccount(value: unknown): AccountCoverage | null {
  if (!isObject(value) || typeof value.account_id !== "string") return null;
  return {
    accountId: value.account_id,
    label: text(value.label, "Account"),
    bankKey: typeof value.bank_key === "string" ? value.bank_key : null,
    statementCount: count(value.statement_count),
    hasStatements: value.has_statements === true,
    coveredRanges: list(value.covered_ranges, readRange),
    periods: list(value.periods, readPeriod),
    gaps: list(value.gaps, readGap),
    overlaps: list(value.overlaps, readOverlap),
    issues: list(value.issues, readIssue),
    firstCovered: isoDate(value.first_covered),
    lastCovered: isoDate(value.last_covered),
  };
}

function readStatement(value: unknown): CoverageStatement | null {
  if (!isObject(value) || typeof value.id !== "string") return null;
  const source = value.period_source;
  return {
    id: value.id,
    fileName: typeof value.file_name === "string" ? value.file_name : null,
    accountId: typeof value.account_id === "string" ? value.account_id : null,
    status: text(value.status, "processed"),
    start: isoDate(value.start),
    end: isoDate(value.end),
    periodSource:
      typeof source === "string" && PERIOD_SOURCES.has(source as PeriodSource)
        ? (source as PeriodSource)
        : null,
    transactionCount: count(value.transaction_count),
  };
}

export function parseStatementCoverage(payload: unknown): StatementCoverage {
  if (!isObject(payload) || !Array.isArray(payload.accounts)) {
    throw new StatementCoverageApiError("The statement coverage response was not recognised.");
  }
  return {
    accounts: list(payload.accounts, readAccount),
    statements: list(payload.statements, readStatement),
    overallStart: isoDate(payload.overall_start),
    overallEnd: isoDate(payload.overall_end),
    totalStatements: count(payload.total_statements),
    failedStatements: count(payload.failed_statements),
    summary: Array.isArray(payload.summary)
      ? payload.summary.filter((line): line is string => typeof line === "string")
      : [],
    disclaimer: text(payload.disclaimer),
  };
}
