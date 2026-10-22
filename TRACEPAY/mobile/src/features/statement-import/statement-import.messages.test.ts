import {
  importNoticeToneForMessage,
  NO_ACTIVITY_IN_PERIOD_MESSAGE,
  NO_TRANSACTIONS_FOUND_MESSAGE,
  toUserFacingImportMessage,
} from "./statement-import.messages";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

// An empty period keeps its own wording instead of the "unusable statement" copy.
assertEqual(
  toUserFacingImportMessage(NO_ACTIVITY_IN_PERIOD_MESSAGE),
  NO_ACTIVITY_IN_PERIOD_MESSAGE,
  "no-activity message is shown as-is",
);
assertEqual(
  importNoticeToneForMessage(NO_ACTIVITY_IN_PERIOD_MESSAGE),
  "info",
  "no-activity notice is informational",
);
assertEqual(
  toUserFacingImportMessage("No reliable transaction rows were extracted."),
  NO_TRANSACTIONS_FOUND_MESSAGE,
  "unreadable statements keep the existing copy",
);
assertEqual(
  importNoticeToneForMessage("The PDF could not be opened."),
  "error",
  "real failures stay errors",
);

console.log("statement-import messages tests passed");
