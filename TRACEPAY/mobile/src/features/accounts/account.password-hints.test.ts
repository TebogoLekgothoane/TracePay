import {
  incorrectPdfPasswordMessage,
  statementPdfPasswordTip,
} from "./account.constants";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

function assertIncludes(actual: string, fragment: string, message: string): void {
  if (!actual.includes(fragment)) {
    throw new Error(`${message} (expected "${actual}" to include "${fragment}")`);
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

test("Standard Bank tip points at last 6 ID digits", () => {
  const tip = statementPdfPasswordTip("Standard Bank");
  assertEqual(tip !== null, true, "tip exists");
  assertIncludes(tip!, "last 6 digits", "tip text");
  assertIncludes(tip!, "full 13-digit", "mentions full ID fallback");
});

test("incorrect Standard Bank password names the last-6 rule", () => {
  const message = incorrectPdfPasswordMessage("Standard Bank");
  assertIncludes(message, "last 6 digits", "error text");
  assertIncludes(message, "full 13-digit", "mentions full ID fallback");
});

test("unknown bank still gets a generic incorrect-password message", () => {
  assertEqual(statementPdfPasswordTip("Mystery Bank"), null, "no tip");
  assertIncludes(
    incorrectPdfPasswordMessage(null),
    "That password didn't work",
    "generic error",
  );
});

console.log("account password hint tests passed");
