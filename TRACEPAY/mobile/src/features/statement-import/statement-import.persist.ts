/**
 * Pure mapping between an extracted statement and the
 * `import_statement_transactions` database function.
 *
 * Deduplication, ownership checks and the processed-status flip happen inside
 * that function in one transaction; nothing here decides what is a duplicate.
 */

import type { ExtractedTransaction, PdfStatementPreview } from "./statement-import.service";

export type ImportRpcRow = {
  date: string;
  transaction_time: string | null;
  description: string;
  amount: number | string;
  type: "debit" | "credit";
  balance: number | string | null;
  currency: string | null;
  category_id: string | null;
  category_confidence: number;
  category_rule: string | null;
  transaction_class: string;
  classification_confidence: number;
  classification_reason: string | null;
  classification_source: string;
  merchant_name: string | null;
  reference: string | null;
  extraction_method: string;
  date_text: string | null;
  date_confidence: string | null;
  date_warnings: string[];
  booking_date: string | null;
  value_date: string | null;
  source_row: number | null;
};

export type ImportRpcResult = {
  statement_id: string;
  rows_received: number;
  inserted: number;
  overlap_duplicates: number;
  possible_duplicates: number;
  already_present: number;
  canonical_transactions: number;
};

export type StatementImportSummary = {
  /** Rows the statement contained. */
  received: number;
  /** Rows that are new to the user's consolidated history. */
  newTransactions: number;
  /** Rows already imported from another statement or an earlier run. */
  overlapDuplicates: number;
  /** Rows kept but flagged: they may repeat another statement's row. */
  possibleDuplicates: number;
};

export function buildImportRpcRows(
  transactions: ReadonlyArray<ExtractedTransaction>,
  categoryIds: ReadonlyMap<string, string>,
  extractionMethod: string,
): ImportRpcRow[] {
  return transactions.map((transaction, index) => ({
    // The amount and date are relayed exactly as extracted. Categorisation
    // fields sit beside them and can never replace them.
    date: transaction.date,
    transaction_time: transaction.transaction_time ?? null,
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    balance: transaction.balance ?? null,
    currency: transaction.currency ?? null,
    category_id: transaction.category_name
      ? (categoryIds.get(transaction.category_name) ?? null)
      : null,
    category_confidence: transaction.category_confidence ?? 0,
    category_rule: transaction.category_rule ?? null,
    transaction_class: transaction.transaction_class ?? "unknown",
    classification_confidence: transaction.classification_confidence ?? 0,
    classification_reason: transaction.classification_reason ?? null,
    classification_source: transaction.category_rule?.startsWith("ai")
      ? "ai"
      : transaction.category_rule
        ? "rule"
        : "none",
    merchant_name: transaction.merchant_name ?? null,
    reference: transaction.reference ?? null,
    extraction_method: extractionMethod,
    date_text: transaction.date_text ?? null,
    date_confidence: transaction.date_confidence ?? null,
    date_warnings: transaction.date_warnings ?? [],
    booking_date: transaction.booking_date ?? null,
    value_date: transaction.value_date ?? null,
    source_row: transaction.source_row ?? index + 1,
  }));
}

export function buildImportRpcStatement(preview: PdfStatementPreview): Record<string, unknown> {
  const { statement } = preview;
  return {
    extraction_method: preview.extractionMethod,
    statement_start_date: statement.statementStartDate,
    statement_end_date: statement.statementEndDate ?? preview.statementBalance.asOfDate,
    period_source: statement.periodSource ?? "unknown",
    opening_balance: statement.openingBalance,
    closing_balance: statement.closingBalance ?? preview.statementBalance.amount,
    extracted_bank: statement.bank,
    extracted_last4: statement.accountNumberLast4,
    balance_as_of: statement.statementEndDate ?? preview.statementBalance.asOfDate,
    balance_source: preview.statementBalance.source,
    balance_reconciliation: preview.balanceReconciliation,
    opening_closing_reconciliation: statement.openingClosingReconciliation ?? null,
    reconciliation_difference: statement.reconciliationDifference ?? null,
    extraction_confidence: preview.confidence,
    rows_detected: preview.rowsDetected,
    rows_rejected: preview.rowsRejected,
    warnings: preview.warnings.slice(0, 20),
  };
}

export function summariseImportResult(result: ImportRpcResult): StatementImportSummary {
  return {
    received: result.rows_received,
    // `inserted` counts every row written, including overlap duplicates that
    // are stored but excluded from totals.
    newTransactions: Math.max(result.inserted - result.overlap_duplicates, 0),
    overlapDuplicates: result.overlap_duplicates + result.already_present,
    possibleDuplicates: result.possible_duplicates,
  };
}

type DatabaseError = { code?: string | null; message?: string | null };

/** User-facing wording for a failed import call. Never exposes SQL text. */
export function describeImportFailure(error: DatabaseError): string {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "23505" || /content_hash|duplicate key/i.test(message)) {
    return "This statement file has already been imported. Nothing was added again.";
  }
  if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(message)) {
    return "TracePay needs its latest database update before it can import statements. Please try again later.";
  }
  if (/period_order/i.test(message)) {
    return "The statement's dates look wrong (the end is before the start), so it was not imported.";
  }
  if (/choose the account|has no account/i.test(message)) {
    return "Choose which account this statement belongs to, then upload it again.";
  }
  if (code === "42501" || /not found|not authenticated/i.test(message)) {
    return "This statement could not be saved to your account. Sign in again and retry.";
  }
  return `The extracted transactions could not be saved${code ? ` (${code})` : ""}.`;
}
