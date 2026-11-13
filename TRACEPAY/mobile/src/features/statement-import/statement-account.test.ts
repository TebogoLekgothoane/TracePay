import {
  accountMismatchMessage,
  assessStatementAccount,
  belongsToOtherAccountMessage,
  type StatementAccountCandidate,
} from "./statement-account";

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

const capitecMain: StatementAccountCandidate = {
  id: "a1",
  name: "Capitec main",
  institution: "Capitec",
  lastFourDigits: "1111",
};
const capitecSavings: StatementAccountCandidate = {
  id: "a2",
  name: "Capitec savings",
  institution: "Capitec",
  lastFourDigits: "2222",
};
const standard: StatementAccountCandidate = {
  id: "a3",
  name: "Standard Bank",
  institution: "Standard Bank",
  lastFourDigits: "1111",
};
const fresh: StatementAccountCandidate = {
  id: "a4",
  name: "Capitec account 3",
  institution: "Capitec",
  lastFourDigits: null,
};

test("matching last four digits confirm the account", () => {
  const verdict = assessStatementAccount(capitecMain, [capitecMain, capitecSavings], "1111");
  assertEqual(verdict.status, "match", "status");
});

test("the statement may print the whole number or a masked one", () => {
  assertEqual(
    assessStatementAccount(capitecMain, [capitecMain], "••••1111").status,
    "match",
    "masked",
  );
  assertEqual(
    assessStatementAccount(capitecMain, [capitecMain], "1050 0000 1111").status,
    "match",
    "long",
  );
});

test("different digits stop the import instead of guessing", () => {
  const verdict = assessStatementAccount(capitecMain, [capitecMain, capitecSavings], "2222");
  assert(verdict.status === "mismatch", "expected mismatch");
  assertEqual(verdict.statementLastFour, "2222", "statement digits");
  assertEqual(verdict.accountLastFour, "1111", "account digits");
  assert(/2222/.test(accountMismatchMessage("1111", "2222")), "message names the digits");
});

test("an account without digits adopts the statement's, once verified", () => {
  const verdict = assessStatementAccount(fresh, [capitecMain, capitecSavings, fresh], "3333");
  assert(verdict.status === "adopt_last4", "expected adopt");
  assertEqual(verdict.lastFour, "3333", "adopted digits");
});

test("digits that belong to another account at the same bank are refused", () => {
  const verdict = assessStatementAccount(fresh, [capitecMain, capitecSavings, fresh], "1111");
  assert(verdict.status === "belongs_to_other_account", "expected other account");
  assertEqual(verdict.accountId, "a1", "owner id");
  assert(
    /Capitec main/.test(belongsToOtherAccountMessage("1111", verdict.accountName)),
    "message names the account",
  );
});

test("the same digits at a different bank do not collide", () => {
  const verdict = assessStatementAccount(fresh, [capitecSavings, standard, fresh], "1111");
  assertEqual(verdict.status, "adopt_last4", "different bank is not the same account");
});

test("a statement with no account number leaves the choice unconfirmed", () => {
  assertEqual(assessStatementAccount(capitecMain, [capitecMain], null).status, "unconfirmed", "null");
  assertEqual(assessStatementAccount(capitecMain, [capitecMain], "12").status, "unconfirmed", "too short");
  assertEqual(assessStatementAccount(fresh, [fresh], undefined).status, "unconfirmed", "undefined");
});

console.log("statement-account tests passed");
