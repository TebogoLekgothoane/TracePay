import {
  buildOccurrenceDedupeKeys,
  buildTransactionDedupeKey,
} from "./transaction.dedupe";

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

const airtime = {
  date: "2026-05-15",
  description: "VAS - Mobile Purchase for 0634994013 Airtime",
  amount: -50,
  type: "debit" as const,
};
const airtimeFee = {
  date: "2026-05-15",
  description: "Fee: VAS - Mobile Purchase for 0634994013 Airtime",
  amount: -0.5,
  type: "debit" as const,
};

test("identical rows in one statement get distinct keys and none is a duplicate", () => {
  const keys = buildOccurrenceDedupeKeys("acc", [airtime, airtimeFee, airtime, airtimeFee, airtime]);
  assertEqual(new Set(keys).size, 5, "every repeated row keeps its own key");
});

test("first occurrence keeps the legacy key so earlier imports still match", () => {
  const keys = buildOccurrenceDedupeKeys("acc", [airtime, airtime]);
  assertEqual(keys[0], buildTransactionDedupeKey("acc", airtime), "legacy key");
  assert(keys[1].endsWith("|#2"), "second occurrence is numbered");
});

test("an overlapping re-import matches occurrence by occurrence", () => {
  const first = buildOccurrenceDedupeKeys("acc", [airtime, airtime, airtime]);
  const reimport = buildOccurrenceDedupeKeys("acc", [airtime, airtime, airtime, airtime]);
  const saved = new Set(first);
  const fresh = reimport.filter((key) => !saved.has(key));
  assertEqual(fresh.length, 1, "only the genuinely new fourth row is new");
});

test("rows saved with legacy keys only restore the collapsed repeats on re-import", () => {
  const legacy = new Set([buildTransactionDedupeKey("acc", airtime)]);
  const reimport = buildOccurrenceDedupeKeys("acc", [airtime, airtime, airtime]);
  assertEqual(reimport.filter((key) => !legacy.has(key)).length, 2, "two repeats come back");
});

test("same row on different days or accounts is not numbered together", () => {
  const keys = buildOccurrenceDedupeKeys("acc", [airtime, { ...airtime, date: "2026-05-16" }]);
  assert(!keys[1].includes("|#"), "different day starts at occurrence one");
  assert(
    buildOccurrenceDedupeKeys("other", [airtime])[0] !== keys[0],
    "account is part of the key",
  );
});

console.log("transaction dedupe tests passed");
