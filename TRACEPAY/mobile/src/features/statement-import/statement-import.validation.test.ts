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

console.log("statement-import validation tests passed");
