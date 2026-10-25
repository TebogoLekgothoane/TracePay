import {
  parseExtractedTransaction,
  requireValidExtractedTransactions,
} from "./statement-import.validation";

const valid = {
  date: "2026-09-18",
  description: "WOOLWORTHS SANDTON",
  amount: -450.0,
  type: "debit",
  balance: 12500.0,
  currency: "ZAR",
  category_name: "Groceries",
  category_confidence: 0.9,
  transaction_class: "spending",
  classification_confidence: 0.9,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

function assertThrows(run: () => void, pattern: RegExp): void {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(pattern.test(message), `error did not match ${pattern}: ${message}`);
    return;
  }
  throw new Error(`expected throw matching ${pattern}`);
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

test("parseExtractedTransaction accepts a processor-shaped transaction", () => {
  const row = parseExtractedTransaction(valid);
  assert(row, "expected a validated transaction");
  assertEqual(row.description, "WOOLWORTHS SANDTON", "description");
  assertEqual(row.type, "debit", "type");
});

test("parseExtractedTransaction rejects missing description", () => {
  assertEqual(parseExtractedTransaction({ ...valid, description: "" }), null, "empty description");
});

test("parseExtractedTransaction rejects invalid type", () => {
  assertEqual(parseExtractedTransaction({ ...valid, type: "transfer" }), null, "invalid type");
});

test("parseExtractedTransaction accepts TRACEPAY direction and balance_after aliases", () => {
  const { type: _ignoredType, balance: _ignoredBalance, ...rest } = valid;
  const row = parseExtractedTransaction({
    ...rest,
    direction: "debit",
    balance_after: 12500.0,
    reference: "NETFLIX",
  });
  assert(row, "expected a validated transaction");
  assertEqual(row.type, "debit", "type from direction");
  assertEqual(row.balance, 12500.0, "balance from balance_after");
  assertEqual(row.reference, "NETFLIX", "reference");
});

test("parseExtractedTransaction rejects confidence outside 0..1", () => {
  assertEqual(
    parseExtractedTransaction({ ...valid, category_confidence: 1.5 }),
    null,
    "invalid confidence",
  );
});

test("parseExtractedTransaction rejects unknown transaction_class", () => {
  assertEqual(
    parseExtractedTransaction({ ...valid, transaction_class: "lottery" }),
    null,
    "invalid class",
  );
});

test("requireValidExtractedTransactions fails closed on empty batch", () => {
  assertThrows(() => requireValidExtractedTransactions([]), /no valid transactions/);
});

test("requireValidExtractedTransactions fails closed when any row is invalid", () => {
  assertThrows(
    () => requireValidExtractedTransactions([valid, { ...valid, type: "nope" }]),
    /invalid transaction data/,
  );
});

test("requireValidExtractedTransactions returns validated rows", () => {
  const rows = requireValidExtractedTransactions([valid]);
  assertEqual(rows.length, 1, "row count");
  assertEqual(rows[0]?.description, "WOOLWORTHS SANDTON", "description");
});

test("dates must be strict ISO calendar dates", () => {
  for (const bad of ["2026-02-30", "02/03/2026", "2026-13-01", "2026-1-5", "March 3 2026", "2026-02-29"]) {
    assertEqual(parseExtractedTransaction({ ...valid, date: bad }), null, `rejects ${bad}`);
  }
  assertEqual(parseExtractedTransaction({ ...valid, date: "2024-02-29" })?.date, "2024-02-29", "leap day is real");
});

test("date provenance fields are validated and preserved", () => {
  const row = parseExtractedTransaction({
    ...valid,
    date_text: "28 Feb",
    date_confidence: "medium",
    date_warnings: ["year_inferred_from_statement_period"],
    value_date: "2026-09-20",
    booking_date: "2026-09-19",
    source_row: 3,
  });
  assert(row, "expected a validated transaction");
  assertEqual(row.date_text, "28 Feb", "date text");
  assertEqual(row.date_confidence, "medium", "confidence");
  assertEqual(row.value_date, "2026-09-20", "value date");
  assertEqual(row.booking_date, "2026-09-19", "booking date");
  assertEqual(row.source_row, 3, "source row");
});

test("malformed provenance rejects the row rather than being coerced", () => {
  assertEqual(parseExtractedTransaction({ ...valid, date_confidence: "certain" }), null, "confidence");
  assertEqual(parseExtractedTransaction({ ...valid, value_date: "next week" }), null, "value date");
  assertEqual(parseExtractedTransaction({ ...valid, booking_date: "2026-02-30" }), null, "booking date");
  assertEqual(parseExtractedTransaction({ ...valid, date_warnings: "oops" }), null, "warnings");
  assertEqual(parseExtractedTransaction({ ...valid, source_row: -1 }), null, "source row");
});

test("older processor payloads without provenance still validate", () => {
  const row = parseExtractedTransaction(valid);
  assert(row, "expected a validated transaction");
  assertEqual(row.date_text, null, "no date text");
  assertEqual(row.date_confidence, null, "unknown confidence stays unknown");
  assertEqual(row.value_date, null, "no value date");
});

console.log("statement-import validation tests passed");
