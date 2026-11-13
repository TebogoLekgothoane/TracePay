import type {
  AccountCoverage,
  CoverageGap,
  GapKind,
  StatementCoverage,
} from "./statement-coverage.types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-03-05` -> `5 Mar 2026`. Reads the string, so no timezone can shift the day. */
export function formatCoverageDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatCoverageRange(start: string | null, end: string | null): string {
  if (!start || !end) return "Dates not available";
  return start === end
    ? formatCoverageDate(start)
    : `${formatCoverageDate(start)} – ${formatCoverageDate(end)}`;
}

export function gapHeadline(kind: GapKind): string {
  switch (kind) {
    case "confirmed_missing":
      return "Statement missing";
    case "balances_continuous":
      return "No activity in this gap";
    case "not_uploaded":
      return "Not uploaded yet";
  }
}

/** Gaps that reduce what TracePay can see; balance-continuous gaps do not. */
export function actionableGaps(account: AccountCoverage): CoverageGap[] {
  return account.gaps.filter((gap) => gap.kind !== "balances_continuous");
}

export type CoverageTone = "complete" | "partial" | "empty";

export function accountCoverageTone(account: AccountCoverage): CoverageTone {
  if (!account.hasStatements) return "empty";
  const hasProblem =
    actionableGaps(account).length > 0 ||
    account.issues.some((issue) => issue.severity !== "info");
  return hasProblem ? "partial" : "complete";
}

export function coverageHeadline(coverage: StatementCoverage): string {
  const accounts = coverage.accounts.filter((account) => account.accountId !== "unassigned");
  if (accounts.length === 0) return "Add a statement to get started";
  const covered = accounts.filter((account) => account.hasStatements).length;
  if (covered === 0) return "No statements uploaded yet";
  const gaps = accounts.reduce((sum, account) => sum + actionableGaps(account).length, 0);
  const accountText = `${covered} of ${accounts.length} account${accounts.length === 1 ? "" : "s"} covered`;
  return gaps > 0
    ? `${accountText} · ${gaps} period${gaps === 1 ? "" : "s"} to check`
    : accountText;
}

/** Plain-language statement of the limit, shown wherever coverage is summarised. */
export const COVERAGE_LIMITS_NOTE =
  "More complete statements make your insights more reliable, but TracePay can only see what is in the statements you upload. Activity from an account or month you have not added cannot be detected.";
