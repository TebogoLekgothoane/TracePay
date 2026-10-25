/** Mirrors backend leak_intelligence/coverage.py as served by GET /statement-coverage. */

export type GapKind = "confirmed_missing" | "balances_continuous" | "not_uploaded";

export type PeriodSource = "declared" | "inferred" | "unknown";

export type CoveragePeriod = {
  statementId: string;
  start: string;
  end: string;
  periodSource: PeriodSource;
  transactionCount: number;
};

export type CoverageGap = {
  accountId: string;
  start: string;
  end: string;
  days: number;
  kind: GapKind;
  /** Balance change across the gap; set only when both balances are known. */
  balanceDifference: number | null;
  message: string;
};

export type CoverageOverlap = {
  accountId: string;
  start: string;
  end: string;
  days: number;
};

export type CoverageIssueKind =
  | "failed"
  | "opening_closing_mismatch"
  | "balance_chain_mismatch"
  | "low_extraction_confidence"
  | "rows_rejected"
  | "period_inferred"
  | "period_inconsistent"
  | "transactions_outside_period"
  | "account_unconfirmed";

export type CoverageIssue = {
  statementId: string;
  kind: CoverageIssueKind;
  message: string;
  severity: "info" | "warning" | "error";
};

export type AccountCoverage = {
  accountId: string;
  label: string;
  bankKey: string | null;
  statementCount: number;
  hasStatements: boolean;
  coveredRanges: Array<{ start: string; end: string }>;
  periods: CoveragePeriod[];
  gaps: CoverageGap[];
  overlaps: CoverageOverlap[];
  issues: CoverageIssue[];
  firstCovered: string | null;
  lastCovered: string | null;
};

export type CoverageStatement = {
  id: string;
  fileName: string | null;
  accountId: string | null;
  status: string;
  start: string | null;
  end: string | null;
  periodSource: PeriodSource | null;
  transactionCount: number;
};

export type StatementCoverage = {
  accounts: AccountCoverage[];
  statements: CoverageStatement[];
  overallStart: string | null;
  overallEnd: string | null;
  totalStatements: number;
  failedStatements: number;
  summary: string[];
  disclaimer: string;
};
