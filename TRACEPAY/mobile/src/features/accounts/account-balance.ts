import { formatRandAmount } from "../../utils/currency";

export type BalanceSource =
  | "closing_balance"
  | "running_balance"
  | "unavailable";

export type BalanceReconciliation =
  | "verified"
  | "not_available"
  | "mismatch";

export type AccountBalanceSummary = {
  accountId: string;
  amount: number | null;
  asOfDate: string | null;
  balanceSource: BalanceSource;
  balanceReconciliation: BalanceReconciliation;
  extractionConfidence: number | null;
  rowsRejected: number;
  hasWarning: boolean;
  warningReason: string | null;
};

export type StatementBalanceTotals = {
  total: number | null;
  asOfDate: string | null;
  hasWarning: boolean;
  warningReason: string | null;
  subtitle: string;
};

function isBalanceSource(value: unknown): value is BalanceSource {
  return (
    value === "closing_balance" ||
    value === "running_balance" ||
    value === "unavailable"
  );
}

function isBalanceReconciliation(value: unknown): value is BalanceReconciliation {
  return (
    value === "verified" ||
    value === "not_available" ||
    value === "mismatch"
  );
}

export function resolveBalanceWarning(input: {
  balanceSource: BalanceSource;
  balanceReconciliation: BalanceReconciliation;
  rowsRejected: number;
  extractionConfidence: number | null;
  amount: number | null;
}): string | null {
  if (input.amount === null || input.balanceSource === "unavailable") {
    return "No balance found on statement";
  }
  if (input.balanceReconciliation === "mismatch") {
    return "Some statement balances don’t reconcile";
  }
  if (input.rowsRejected > 0) {
    return "Some rows couldn’t be read";
  }
  if (
    input.extractionConfidence !== null &&
    input.extractionConfidence < 0.65
  ) {
    return "Import needs review";
  }
  return null;
}

export function readAccountBalanceRow(value: unknown): AccountBalanceSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.account_id !== "string" || row.account_id.length === 0) {
    return null;
  }
  const amountRaw = row.balance;
  const amount =
    amountRaw === null || amountRaw === undefined
      ? null
      : Number(amountRaw);
  const normalizedAmount =
    amount !== null && Number.isFinite(amount) ? amount : null;
  const asOfDate =
    typeof row.as_of_date === "string" && row.as_of_date.length > 0
      ? row.as_of_date
      : null;
  const balanceSource = isBalanceSource(row.balance_source)
    ? row.balance_source
    : normalizedAmount === null
      ? "unavailable"
      : "running_balance";
  const balanceReconciliation = isBalanceReconciliation(
    row.balance_reconciliation,
  )
    ? row.balance_reconciliation
    : "not_available";
  const extractionConfidence =
    row.extraction_confidence === null ||
    row.extraction_confidence === undefined
      ? null
      : Number(row.extraction_confidence);
  const rowsRejected = Number(row.rows_rejected ?? 0);
  const warningReason = resolveBalanceWarning({
    balanceSource,
    balanceReconciliation,
    rowsRejected: Number.isFinite(rowsRejected) ? rowsRejected : 0,
    extractionConfidence:
      extractionConfidence !== null && Number.isFinite(extractionConfidence)
        ? extractionConfidence
        : null,
    amount: normalizedAmount,
  });
  const hasWarning =
    row.has_warning === true || warningReason !== null;

  return {
    accountId: row.account_id,
    amount: normalizedAmount,
    asOfDate,
    balanceSource,
    balanceReconciliation,
    extractionConfidence:
      extractionConfidence !== null && Number.isFinite(extractionConfidence)
        ? extractionConfidence
        : null,
    rowsRejected: Number.isFinite(rowsRejected) ? rowsRejected : 0,
    hasWarning,
    warningReason,
  };
}

export function formatStatementAsOfDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatStatementBalanceSubtitle(
  asOfDate: string | null,
  hasAccounts: boolean,
): string {
  if (!hasAccounts) {
    return "Add a statement to see balance";
  }
  const formatted = formatStatementAsOfDate(asOfDate);
  if (formatted) {
    return `From statements · as of ${formatted}`;
  }
  return "From statements · as of latest import";
}

export function summarizeStatementBalances(
  summaries: readonly AccountBalanceSummary[],
): StatementBalanceTotals {
  const withAmounts = summaries.filter(
    (item): item is AccountBalanceSummary & { amount: number } =>
      item.amount !== null,
  );
  const total =
    withAmounts.length === 0
      ? null
      : withAmounts.reduce((sum, item) => sum + item.amount, 0);

  let asOfDate: string | null = null;
  for (const item of summaries) {
    if (!item.asOfDate) continue;
    if (!asOfDate || item.asOfDate > asOfDate) {
      asOfDate = item.asOfDate;
    }
  }

  const warned = summaries.find((item) => item.hasWarning && item.warningReason);
  return {
    total,
    asOfDate,
    hasWarning: summaries.some((item) => item.hasWarning),
    warningReason: warned?.warningReason ?? null,
    subtitle: formatStatementBalanceSubtitle(
      asOfDate,
      summaries.length > 0,
    ),
  };
}

export function formatAccountBalanceAsOfLabel(
  asOfDate: string | null,
): string | null {
  const formatted = formatStatementAsOfDate(asOfDate);
  return formatted ? `as of ${formatted}` : null;
}

export function formatBalanceAmountLabel(amount: number | null): string {
  return amount === null ? "—" : formatRandAmount(amount);
}
