import type { FinancialAccount } from "./account.types";
import {
  formatAccountHeading,
  formatAccountSubtitle,
  formatStatementCount,
  normalizeCreateAccountInput,
} from "./account.validation";

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

const account = (overrides: Partial<FinancialAccount> = {}): FinancialAccount => ({
  id: "acc-1",
  userId: "user-1",
  name: "Everyday Cheque",
  institution: "FNB",
  accountType: "cheque",
  currency: "ZAR",
  lastFourDigits: "4821",
  connectionSource: "manual",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

test("account heading uses the bank, nickname stays in the subtitle", () => {
  const fnb = account();
  assertEqual(formatAccountHeading(fnb), "FNB", "heading");
  assertEqual(formatAccountSubtitle(fnb), "Everyday Cheque · Cheque · ••••4821", "subtitle");
});

test("last 4 digits remain optional", () => {
  const savings = account({
    name: "Savings",
    institution: "Capitec",
    accountType: "savings",
    lastFourDigits: null,
  });
  assertEqual(formatAccountHeading(savings), "Capitec", "heading");
  assertEqual(formatAccountSubtitle(savings), "Savings", "subtitle");
});

test("accounts can be created without a statement or last 4", () => {
  const created = normalizeCreateAccountInput({
    name: "Credit Card",
    institution: "FNB",
    accountType: "credit_card",
  });
  assertEqual(created.lastFourDigits, null, "last4");
  assertEqual(created.connectionSource, "manual", "source");
  assertEqual(created.institution, "FNB", "bank");
});

test("statement counts stay per account", () => {
  assertEqual(formatStatementCount(0), "0 statements", "none");
  assertEqual(formatStatementCount(1), "1 statement", "one");
  assertEqual(formatStatementCount(3), "3 statements", "many");
});

console.log("account relationship tests passed");
