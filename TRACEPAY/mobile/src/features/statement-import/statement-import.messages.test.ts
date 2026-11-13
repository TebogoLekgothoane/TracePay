import {
  ALL_ALREADY_IMPORTED_MESSAGE,
  buildQueueSummary,
  classifyStatementSave,
  COVERAGE_NOTES,
  importNoticeToneForMessage,
  isAccountMismatchMessage,
  nextAccountName,
  NO_ACTIVITY_IN_PERIOD_MESSAGE,
  NO_TRANSACTIONS_FOUND_MESSAGE,
  queueStatusLabel,
  queueSummaryHeadline,
  queueSummaryLines,
  toUserFacingImportMessage,
} from "./statement-import.messages";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

function test(name: string, run: () => void): void {
  run();
  console.log(`ok - ${name}`);
}

test("an empty period keeps its own wording", () => {
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
});

test("a fully overlapping statement is not an empty one", () => {
  const overlap = classifyStatementSave({
    inserted: 0,
    received: 40,
    overlapDuplicates: 40,
    extractedRows: 40,
  });
  assertEqual(overlap.status, "already_imported", "overlap is not a failure");
  assertEqual(
    classifyStatementSave({ inserted: 0, received: 0, overlapDuplicates: 0, extractedRows: 0 })
      .status,
    "empty",
    "zero rows is the empty case",
  );
  assertEqual(
    classifyStatementSave({ inserted: 12, received: 20, overlapDuplicates: 8, extractedRows: 20 })
      .newTransactions,
    12,
    "new rows counted",
  );
});

test("queue summary totals", () => {
  const summary = buildQueueSummary([
    { status: "saved", newTransactions: 10, overlapDuplicates: 2, possibleDuplicates: 1 },
    { status: "already_imported", overlapDuplicates: 30 },
    { status: "password" },
    { status: "problem" },
    { status: "empty" },
    { status: "waiting" },
  ]);
  assertEqual(summary.total, 6, "total");
  assertEqual(summary.saved, 2, "saved includes already imported");
  assertEqual(summary.fullyOverlapping, 1, "fully overlapping");
  assertEqual(summary.newTransactions, 10, "new transactions");
  assertEqual(summary.overlapDuplicates, 32, "overlap");
  assertEqual(summary.possibleDuplicates, 1, "possible duplicates");
  assertEqual(summary.needsPassword, 1, "password");
  assertEqual(summary.problems, 1, "problems");
  assertEqual(summary.empty, 1, "empty");
  assertEqual(summary.unfinished, 1, "unfinished");
  assertEqual(queueSummaryHeadline(summary), "2 statements saved", "headline");
  assertEqual(queueSummaryLines(summary).length >= 4, true, "lines");
});

test("summary wording for an all-overlap upload", () => {
  const summary = buildQueueSummary([{ status: "already_imported", overlapDuplicates: 5 }]);
  assertEqual(queueSummaryHeadline(summary), "1 statement saved", "singular");
  assertEqual(queueSummaryLines(summary)[0], ALL_ALREADY_IMPORTED_MESSAGE, "overlap line");
  assertEqual(
    queueSummaryHeadline(buildQueueSummary([{ status: "problem" }])),
    "No statements were saved",
    "nothing saved",
  );
});

test("status labels", () => {
  assertEqual(queueStatusLabel("password"), "Needs password", "password label");
  assertEqual(queueStatusLabel("already_imported"), "Already imported", "overlap label");
});

test("distinct valid account names", () => {
  assertEqual(nextAccountName("Capitec", []), "Capitec", "first account keeps bank name");
  assertEqual(nextAccountName("Capitec", ["Capitec"]), "Capitec account 2", "second");
  assertEqual(
    nextAccountName("Capitec", ["capitec", "Capitec account 2"]),
    "Capitec account 3",
    "third, case-insensitive",
  );
  const name = nextAccountName("x".repeat(200), ["x".repeat(60)]);
  assertEqual(name.length >= 2 && name.length <= 80, true, "length is valid");
});

test("account mismatch messages are recognised", () => {
  assertEqual(
    isAccountMismatchMessage(
      "This statement is for an account ending 1234, but you chose the account ending 5678. Choose the matching account.",
    ),
    true,
    "mismatch",
  );
  assertEqual(
    isAccountMismatchMessage(
      'This statement is for the account ending 1234, which you already have as "Savings".',
    ),
    true,
    "belongs to other",
  );
  assertEqual(isAccountMismatchMessage("The PDF could not be opened."), false, "unrelated");
});

test("coverage wording covers the four points", () => {
  const text = COVERAGE_NOTES.join(" ").toLowerCase();
  assertEqual(text.includes("more statements any time"), true, "add more");
  assertEqual(text.includes("more reliable"), true, "reliability");
  assertEqual(text.includes("cannot detect activity"), true, "blind spot");
  assertEqual(text.includes("do not need to add every bank"), true, "optional");
});

console.log("statement-import messages tests passed");
