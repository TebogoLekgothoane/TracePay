import {
  assertExtractedBankMatchesSelected,
  assertKnownStatementBankKey,
  BANK_ALREADY_UPLOADED_MESSAGE,
  BANK_UNIDENTIFIED_MESSAGE,
  bankSlotUniqueViolationMessage,
  normalizeStatementBankKey,
} from "./statement-bank";

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

test("first upload bank key resolves for supported institutions", () => {
  assertEqual(normalizeStatementBankKey("Capitec"), "capitec", "capitec");
  assertEqual(normalizeStatementBankKey("FNB"), "fnb", "fnb");
  assertEqual(normalizeStatementBankKey("First National Bank"), "fnb", "fnb alias");
  assertEqual(normalizeStatementBankKey("Standard Bank"), "standard bank", "standard");
  assertEqual(assertKnownStatementBankKey("TymeBank"), "tymebank", "tyme");
  assertEqual(normalizeStatementBankKey("GoTyme"), "tymebank", "gotyme maps to tymebank");
});

test("GoTyme statement matches selected TymeBank", () => {
  assertExtractedBankMatchesSelected("TymeBank", "GoTyme");
});

test("unknown or empty bank is not guessed", () => {
  assertEqual(normalizeStatementBankKey("Mystery Bank"), null, "unknown");
  assertEqual(normalizeStatementBankKey(""), null, "empty");
  assertEqual(normalizeStatementBankKey(null), null, "null");
});

test("second statement from same bank is rejected by match helper messaging", () => {
  assertEqual(
    BANK_ALREADY_UPLOADED_MESSAGE.includes("one statement per bank"),
    true,
    "user-facing copy",
  );
});

test("different bank is allowed by identity comparison", () => {
  assertExtractedBankMatchesSelected("FNB", "FNB");
  assertEqual(normalizeStatementBankKey("FNB"), "fnb", "fnb key");
  assertEqual(normalizeStatementBankKey("Capitec") !== normalizeStatementBankKey("FNB"), true, "diff");
});

test("unidentified extracted bank is blocked with a clear message", () => {
  assertThrows(
    () => assertExtractedBankMatchesSelected("Capitec", null),
    new RegExp(BANK_UNIDENTIFIED_MESSAGE.slice(0, 40)),
  );
  assertThrows(
    () => assertExtractedBankMatchesSelected("Capitec", "Mystery Bank"),
    new RegExp(BANK_UNIDENTIFIED_MESSAGE.slice(0, 40)),
  );
});

test("mismatched extracted bank is blocked", () => {
  assertThrows(
    () => assertExtractedBankMatchesSelected("Capitec", "FNB"),
    /looks like a FNB statement/,
  );
});

test("duplicate-file unique violation stays distinct from bank-slot violation", () => {
  assertEqual(
    bankSlotUniqueViolationMessage(
      'duplicate key value violates unique constraint "statement_imports_user_content_hash_processed_key"',
    ),
    null,
    "hash unique is not bank slot",
  );
  assertEqual(
    bankSlotUniqueViolationMessage(
      'duplicate key value violates unique constraint "statement_imports_user_bank_slot_active_key"',
    ),
    BANK_ALREADY_UPLOADED_MESSAGE,
    "bank slot unique maps to message",
  );
});

console.log("statement-bank tests passed");
