import { statementPdfPasswordStorageKey } from "./statement-pdf-password.keys";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

function assertThrows(run: () => void, message: string): void {
  try {
    run();
  } catch {
    console.log(`ok - ${message}`);
    return;
  }
  throw new Error(`${message} (expected throw)`);
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

const SAMPLE_ID = "d5f372c0-fe76-43c8-9704-b434af59c31a";

test("storage key is namespaced by account id", () => {
  assertEqual(
    statementPdfPasswordStorageKey(SAMPLE_ID),
    `tracepay.statement.pdf-password.v1.${SAMPLE_ID}`,
    "key format",
  );
});

test("rejects non-uuid account ids", () => {
  assertThrows(
    () => statementPdfPasswordStorageKey("not-a-uuid"),
    "rejects invalid account id",
  );
});

console.log("statement pdf password tests passed");
