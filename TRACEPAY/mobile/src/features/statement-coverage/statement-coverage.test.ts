import {
  accountCoverageTone,
  actionableGaps,
  coverageHeadline,
  formatCoverageDate,
  formatCoverageRange,
  gapHeadline,
} from "./statement-coverage.format";
import { parseStatementCoverage, StatementCoverageApiError } from "./statement-coverage.parse";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function test(name: string, run: () => void) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    account_id: "acc-1",
    label: "FNB 1234",
    bank_key: "fnb",
    statement_count: 1,
    has_statements: true,
    covered_ranges: [["2026-01-01", "2026-01-31"]],
    periods: [
      {
        statement_id: "s1",
        start: "2026-01-01",
        end: "2026-01-31",
        period_source: "declared",
        transaction_count: 12,
      },
    ],
    gaps: [],
    overlaps: [],
    issues: [],
    first_covered: "2026-01-01",
    last_covered: "2026-01-31",
    ...overrides,
  };
}

function payload(accounts: unknown[] = [account()]) {
  return {
    accounts,
    statements: [{ id: "s1", file_name: "jan.pdf", account_id: "acc-1", status: "processed" }],
    overall_start: "2026-01-01",
    overall_end: "2026-01-31",
    total_statements: 1,
    failed_statements: 0,
    summary: ["one", 2],
    disclaimer: "only what you uploaded",
  };
}

test("parses a valid payload", () => {
  const coverage = parseStatementCoverage(payload());
  assert(coverage.accounts.length === 1, "one account");
  assert(coverage.accounts[0].coveredRanges[0].start === "2026-01-01", "range kept");
  assert(coverage.accounts[0].periods[0].transactionCount === 12, "count kept");
  assert(coverage.statements[0].fileName === "jan.pdf", "file name kept for display");
  assert(coverage.summary.length === 1, "non-string summary lines dropped");
  assert(coverage.disclaimer === "only what you uploaded", "disclaimer kept");
});

test("rejects malformed payloads", () => {
  for (const bad of [null, "x", [], {}, { accounts: "no" }]) {
    let threw = false;
    try {
      parseStatementCoverage(bad);
    } catch (error) {
      threw = error instanceof StatementCoverageApiError;
    }
    assert(threw, `rejects ${JSON.stringify(bad)}`);
  }
});

test("drops unknown enum values and bad dates instead of guessing", () => {
  const coverage = parseStatementCoverage(
    payload([
      account({
        gaps: [
          { account_id: "acc-1", start: "2026-02-01", end: "2026-02-10", days: 10, kind: "mystery", message: "m" },
          { account_id: "acc-1", start: "2026-02-01", end: "2026-02-10", days: 10, kind: "not_uploaded", message: "m" },
          { account_id: "acc-1", start: "bad", end: "2026-02-10", days: 10, kind: "not_uploaded", message: "m" },
        ],
        issues: [
          { statement_id: "s1", kind: "invented", message: "x", severity: "info" },
          { statement_id: "s1", kind: "failed", message: "x", severity: "weird" },
        ],
        periods: [
          { statement_id: "s1", start: "2026-01-01", end: "2026-01-31", period_source: "guess", transaction_count: 1 },
        ],
      }),
    ]),
  );
  const parsed = coverage.accounts[0];
  assert(parsed.gaps.length === 1 && parsed.gaps[0].kind === "not_uploaded", "only valid gap kept");
  assert(parsed.issues.length === 1, "unknown issue kind dropped");
  assert(parsed.issues[0].severity === "warning", "unknown severity falls back to warning");
  assert(parsed.periods.length === 0, "unknown period source dropped");
});

test("dates are not shifted by timezone", () => {
  assert(formatCoverageDate("2026-03-01") === "1 Mar 2026", "first of month");
  assert(formatCoverageDate("2026-12-31") === "31 Dec 2026", "last of year");
  assert(formatCoverageDate(null) === "—", "null date");
  assert(
    formatCoverageRange("2026-03-01", "2026-03-31") === "1 Mar 2026 – 31 Mar 2026",
    "range",
  );
  assert(formatCoverageRange("2026-03-05", "2026-03-05") === "5 Mar 2026", "single day");
  assert(formatCoverageRange(null, null) === "Dates not available", "no dates");
});

test("gap headlines keep the three meanings distinct", () => {
  assert(gapHeadline("confirmed_missing") === "Statement missing", "confirmed");
  assert(gapHeadline("not_uploaded") === "Not uploaded yet", "not uploaded");
  assert(gapHeadline("balances_continuous") === "No activity in this gap", "continuous");
});

test("tone and headline logic", () => {
  const gap = (kind: string) => ({
    account_id: "acc-1",
    start: "2026-02-01",
    end: "2026-02-10",
    days: 10,
    kind,
    message: "m",
  });
  const tone = (overrides: Record<string, unknown>) =>
    accountCoverageTone(parseStatementCoverage(payload([account(overrides)])).accounts[0]);
  assert(tone({}) === "complete", "complete");
  assert(tone({ has_statements: false, statement_count: 0 }) === "empty", "empty");
  assert(tone({ gaps: [gap("not_uploaded")] }) === "partial", "not uploaded is partial");
  assert(tone({ gaps: [gap("confirmed_missing")] }) === "partial", "missing is partial");
  assert(tone({ gaps: [gap("balances_continuous")] }) === "complete", "continuous is fine");
  assert(
    tone({ issues: [{ statement_id: "s1", kind: "period_inferred", message: "m", severity: "info" }] }) ===
      "complete",
    "info issue is fine",
  );
  assert(
    tone({ issues: [{ statement_id: "s1", kind: "failed", message: "m", severity: "error" }] }) === "partial",
    "error issue is partial",
  );
  const withGaps = parseStatementCoverage(
    payload([account({ gaps: [gap("not_uploaded"), gap("balances_continuous")] })]),
  ).accounts[0];
  assert(actionableGaps(withGaps).length === 1, "continuous gaps are not actionable");

  assert(coverageHeadline(parseStatementCoverage(payload([]))) === "Add a statement to get started", "no accounts");
  assert(
    coverageHeadline(parseStatementCoverage(payload([account({ has_statements: false })]))) ===
      "No statements uploaded yet",
    "none covered",
  );
  assert(coverageHeadline(parseStatementCoverage(payload())) === "1 of 1 account covered", "all covered");
  const two = parseStatementCoverage(
    payload([account({ gaps: [gap("not_uploaded")] }), account({ account_id: "acc-2", has_statements: false })]),
  );
  assert(coverageHeadline(two) === "1 of 2 accounts covered · 1 period to check", "partial headline");
  const unassigned = parseStatementCoverage(
    payload([account(), account({ account_id: "unassigned", has_statements: false })]),
  );
  assert(coverageHeadline(unassigned) === "1 of 1 account covered", "unassigned excluded");
});
