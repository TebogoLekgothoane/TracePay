import {
  buildImportRpcRows,
  buildImportRpcStatement,
  describeImportFailure,
  summariseImportResult,
} from "./statement-import.persist";
import type { ExtractedTransaction, PdfStatementPreview } from "./statement-import.service";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

const row: ExtractedTransaction = {
  date: "2026-02-28",
  description: "  CARD PURCHASE SPAR 02/03/2026 ",
  amount: -75.25,
  type: "debit",
  balance: 1200.5,
  currency: "ZAR",
  category_name: "Groceries",
  category_confidence: 0.9,
  category_rule: "merchant:spar",
  transaction_class: "spending",
  classification_confidence: 0.9,
  merchant_name: "Spar",
  reference: "REF-1",
  date_text: "28 Feb",
  date_confidence: "medium",
  date_warnings: ["year_inferred_from_statement_period"],
  value_date: "2026-03-02",
  booking_date: null,
  source_row: 4,
};

test("rows relay the extracted date, amount and description untouched", () => {
  const [mapped] = buildImportRpcRows([row], new Map([["Groceries", "cat-1"]]), "table");
  assertEqual(mapped.date, "2026-02-28", "date");
  assertEqual(mapped.amount, -75.25, "signed amount");
  assertEqual(mapped.description, row.description, "description is not trimmed or rewritten");
  assertEqual(mapped.type, "debit", "direction");
  assertEqual(mapped.category_id, "cat-1", "category is a label beside the data");
});

test("date provenance is carried through for audit", () => {
  const [mapped] = buildImportRpcRows([row], new Map(), "table");
  assertEqual(mapped.date_text, "28 Feb", "original date text");
  assertEqual(mapped.date_confidence, "medium", "confidence");
  assertEqual(mapped.date_warnings[0], "year_inferred_from_statement_period", "warnings");
  assertEqual(mapped.value_date, "2026-03-02", "value date stays separate");
  assertEqual(mapped.source_row, 4, "source row");
});

test("a row with no category stays unclassified rather than assigned", () => {
  const unknown: ExtractedTransaction = {
    date: "2026-04-09",
    description: "XYZZY HOLDINGS 4471",
    amount: -321.1,
    type: "debit",
  };
  const [mapped] = buildImportRpcRows([unknown], new Map(), "table");
  assertEqual(mapped.category_id, null, "no category invented");
  assertEqual(mapped.transaction_class, "unknown", "class unknown");
  assertEqual(mapped.classification_source, "none", "no classification source");
  assertEqual(mapped.date_text, null, "no date text invented");
  assertEqual(mapped.value_date, null, "no value date invented");
  assertEqual(mapped.source_row, 1, "row position is recorded");
});

test("classification source separates rules from AI", () => {
  const [rule] = buildImportRpcRows([row], new Map(), "table");
  assertEqual(rule.classification_source, "rule", "rule");
  const [ai] = buildImportRpcRows([{ ...row, category_rule: "ai:openrouter" }], new Map(), "table");
  assertEqual(ai.classification_source, "ai", "ai");
});

test("the statement payload keeps declared versus inferred periods apart", () => {
  const preview = {
    extractionMethod: "table",
    confidence: 0.9,
    warnings: ["a"],
    rowsDetected: 10,
    rowsRejected: 1,
    balanceReconciliation: "verified",
    statementBalance: { amount: 100, asOfDate: "2026-03-31", source: "closing_balance" },
    statement: {
      bank: "Capitec",
      accountNumberLast4: "1111",
      accountType: "cheque",
      statementStartDate: "2026-03-01",
      statementEndDate: null,
      openingBalance: 50,
      closingBalance: null,
      periodSource: "inferred",
      openingClosingReconciliation: "mismatch",
      reconciliationDifference: -12.5,
    },
  } as unknown as PdfStatementPreview;
  const payload = buildImportRpcStatement(preview);
  assertEqual(payload.period_source, "inferred", "period source");
  assertEqual(payload.statement_end_date, "2026-03-31", "falls back to the balance date, not today");
  assertEqual(payload.closing_balance, 100, "closing balance");
  assertEqual(payload.opening_closing_reconciliation, "mismatch", "reconciliation");
  assertEqual(payload.reconciliation_difference, -12.5, "difference");
  assertEqual(payload.extracted_last4, "1111", "digits only, never a full number");
});

test("import results separate new rows from overlap and flagged rows", () => {
  const summary = summariseImportResult({
    statement_id: "s",
    rows_received: 10,
    inserted: 9,
    overlap_duplicates: 4,
    possible_duplicates: 2,
    already_present: 1,
    canonical_transactions: 5,
  });
  assertEqual(summary.received, 10, "received");
  assertEqual(summary.newTransactions, 5, "new = inserted minus overlap duplicates");
  assertEqual(summary.overlapDuplicates, 5, "overlap includes rows already present from a re-run");
  assertEqual(summary.possibleDuplicates, 2, "flagged");
});

test("a fully overlapping statement reports zero new transactions", () => {
  const summary = summariseImportResult({
    statement_id: "s",
    rows_received: 6,
    inserted: 6,
    overlap_duplicates: 6,
    possible_duplicates: 0,
    already_present: 0,
    canonical_transactions: 0,
  });
  assertEqual(summary.newTransactions, 0, "nothing new");
  assertEqual(summary.overlapDuplicates, 6, "all overlap");
});

test("failure wording never leaks SQL", () => {
  assert(/already been imported/.test(describeImportFailure({ code: "23505" })), "duplicate file");
  assert(/latest database update/.test(describeImportFailure({ code: "PGRST202" })), "missing function");
  assert(/dates look wrong/.test(describeImportFailure({ message: "violates check constraint statement_imports_period_order_check" })), "period order");
  assert(/Choose which account/.test(describeImportFailure({ message: "statement has no account; choose the account before importing" })), "no account");
  const generic = describeImportFailure({ code: "XX000", message: "select * from transactions where secret" });
  assert(!/select|secret/i.test(generic), "no SQL text");
});

console.log("statement-import persist tests passed");
