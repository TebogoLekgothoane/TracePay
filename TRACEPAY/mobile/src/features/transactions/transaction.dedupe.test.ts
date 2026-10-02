import { buildTransactionDedupeKey } from "./transaction.dedupe";

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

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

const netflix = {
  date: "2026-09-15",
  description: "NETFLIX.COM",
  amount: -199,
  type: "debit" as const,
};

test("dedupe key is not description alone", () => {
  const key = buildTransactionDedupeKey("acc-fnb", netflix);
  assert(key.includes("acc-fnb"), "account id");
  assert(key.includes("2026-09-15"), "date");
  assert(key.includes("debit"), "direction");
  assert(key.includes("199.00"), "amount");
  assert(key.includes("netflix com"), "normalised description");
  assert(key !== "NETFLIX.COM", "must not be description only");
});

test("the same merchant on two accounts is not a duplicate", () => {
  assertEqual(
    buildTransactionDedupeKey("acc-fnb", netflix) ===
      buildTransactionDedupeKey("acc-capitec", netflix),
    false,
    "cross-account",
  );
});

test("overlapping statements can mark the same canonical row as a duplicate", () => {
  const first = buildTransactionDedupeKey("acc-fnb", netflix);
  const second = buildTransactionDedupeKey("acc-fnb", {
    ...netflix,
    description: "Netflix.com",
  });
  assertEqual(first, second, "normalised overlapping row");
});

test("same date and amount with a different description is not a duplicate", () => {
  assertEqual(
    buildTransactionDedupeKey("acc-fnb", netflix) ===
      buildTransactionDedupeKey("acc-fnb", {
        ...netflix,
        description: "SPOTIFY",
      }),
    false,
    "different merchant",
  );
});

console.log("transaction dedupe tests passed");
