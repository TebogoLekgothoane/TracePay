/** User-facing copy for statement import outcomes that aren't hard failures. */

import { isBankMismatchError } from "./statement-bank";

export const NO_TRANSACTIONS_FOUND_MESSAGE =
  "We opened this statement, but it doesn't include any transactions TracePay can use. Upload a statement with your transaction history to continue.";

/** The statement's own summary shows no money in or out for its period. */
export const NO_ACTIVITY_IN_PERIOD_MESSAGE =
  "This statement has no transactions in this period, so there's nothing to import. Upload a statement for a period with account activity.";

export type ImportNoticeTone = "info" | "error";

export function isNoTransactionsImportMessage(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    text.includes("no reliable transaction") ||
    text.includes("no transactions could be saved") ||
    text.includes("doesn't include any transactions") ||
    text.includes("does not include any transactions")
  );
}

export function isExpectedImportNotice(message: string): boolean {
  return (
    isNoTransactionsImportMessage(message) ||
    message.trim() === NO_ACTIVITY_IN_PERIOD_MESSAGE ||
    isBankMismatchError(message)
  );
}

export function toUserFacingImportMessage(raw: string): string {
  const text = raw.trim();
  if (!text) {
    return "We couldn't process this statement. Try another PDF.";
  }
  if (isNoTransactionsImportMessage(text)) {
    return NO_TRANSACTIONS_FOUND_MESSAGE;
  }
  return text;
}

export function importNoticeToneForMessage(message: string): ImportNoticeTone {
  return isExpectedImportNotice(message) ? "info" : "error";
}

/* ---------------------------------------------------------------------------
 * Coverage wording: shown on the upload screens and the completion screen.
 * ------------------------------------------------------------------------- */

export const COVERAGE_ADD_MORE_MESSAGE =
  "You can add more statements any time: other banks, other accounts and other months.";

export const COVERAGE_RELIABILITY_MESSAGE =
  "The more complete your statements, the more reliable your insights.";

export const COVERAGE_BLIND_SPOT_MESSAGE =
  "TracePay can only see what is in the statements you add. It cannot detect activity in accounts or months you have not uploaded.";

export const COVERAGE_OPTIONAL_MESSAGE =
  "You do not need to add every bank to get started.";

export const COVERAGE_NOTES: ReadonlyArray<string> = [
  COVERAGE_ADD_MORE_MESSAGE,
  COVERAGE_RELIABILITY_MESSAGE,
  COVERAGE_BLIND_SPOT_MESSAGE,
  COVERAGE_OPTIONAL_MESSAGE,
];

export const ALL_ALREADY_IMPORTED_MESSAGE =
  "Everything in this statement was already imported; nothing was added twice.";

export const ADD_ANOTHER_STATEMENT_LABEL = "Add another statement";
export const DONE_LABEL = "Done";

export function differentAccountLabel(bank: string): string {
  return `A different account at ${bank}`;
}

export function chooseAccountTitle(bank: string): string {
  return `Which ${bank} account is this statement for?`;
}

export const CHOOSE_ACCOUNT_HELP =
  "Pick the account the statement belongs to. TracePay checks the account number on the statement and will tell you if it does not match.";

/* ---------------------------------------------------------------------------
 * Upload queue (several PDFs in one go)
 * ------------------------------------------------------------------------- */

export type QueueItemStatus =
  | "waiting"
  | "reading"
  | "saved"
  | "already_imported"
  | "password"
  | "problem"
  | "empty";

export type QueueSummaryItem = {
  status: QueueItemStatus;
  newTransactions?: number;
  overlapDuplicates?: number;
  possibleDuplicates?: number;
};

export type QueueSummary = {
  total: number;
  /** Statements stored (including ones whose rows were all already imported). */
  saved: number;
  /** Saved statements that added nothing new because everything overlapped. */
  fullyOverlapping: number;
  newTransactions: number;
  overlapDuplicates: number;
  possibleDuplicates: number;
  needsPassword: number;
  problems: number;
  empty: number;
  unfinished: number;
};

export function buildQueueSummary(items: ReadonlyArray<QueueSummaryItem>): QueueSummary {
  const summary: QueueSummary = {
    total: items.length,
    saved: 0,
    fullyOverlapping: 0,
    newTransactions: 0,
    overlapDuplicates: 0,
    possibleDuplicates: 0,
    needsPassword: 0,
    problems: 0,
    empty: 0,
    unfinished: 0,
  };
  for (const item of items) {
    switch (item.status) {
      case "saved":
      case "already_imported":
        summary.saved += 1;
        if (item.status === "already_imported") summary.fullyOverlapping += 1;
        summary.newTransactions += Math.max(item.newTransactions ?? 0, 0);
        summary.overlapDuplicates += Math.max(item.overlapDuplicates ?? 0, 0);
        summary.possibleDuplicates += Math.max(item.possibleDuplicates ?? 0, 0);
        break;
      case "password":
        summary.needsPassword += 1;
        break;
      case "problem":
        summary.problems += 1;
        break;
      case "empty":
        summary.empty += 1;
        break;
      default:
        summary.unfinished += 1;
    }
  }
  return summary;
}

export type StatementSaveClassification = {
  status: "saved" | "already_imported" | "empty";
  newTransactions: number;
};

/**
 * A statement whose rows were all in the user's history already is not a failure.
 * Only a statement with zero extracted rows is the "no transactions" case.
 */
export function classifyStatementSave(input: {
  /** New transactions added to consolidated history (findingSummary.inserted). */
  inserted?: number | null;
  /** Rows the statement contained (importSummary.received). */
  received?: number | null;
  overlapDuplicates?: number | null;
  /** Fallback: rows extracted from the PDF. */
  extractedRows: number;
}): StatementSaveClassification {
  const newTransactions = Math.max(input.inserted ?? 0, 0);
  if (newTransactions > 0) {
    return { status: "saved", newTransactions };
  }
  const received = input.received ?? input.extractedRows;
  if ((input.overlapDuplicates ?? 0) > 0 || received > 0) {
    return { status: "already_imported", newTransactions: 0 };
  }
  return { status: "empty", newTransactions: 0 };
}

export function queueStatusLabel(status: QueueItemStatus): string {
  switch (status) {
    case "waiting":
      return "Waiting";
    case "reading":
      return "Reading";
    case "saved":
      return "Saved";
    case "already_imported":
      return "Already imported";
    case "password":
      return "Needs password";
    case "empty":
      return "No transactions";
    default:
      return "Problem";
  }
}

function plural(count: number, one: string, many: string): string {
  const label = count.toLocaleString("en-ZA");
  return `${label} ${count === 1 ? one : many}`;
}

export function queueSummaryHeadline(summary: QueueSummary): string {
  if (summary.saved === 0) return "No statements were saved";
  return `${plural(summary.saved, "statement", "statements")} saved`;
}

export function queueSummaryLines(summary: QueueSummary): string[] {
  const lines: string[] = [];
  if (summary.saved > 0) {
    lines.push(
      summary.newTransactions > 0
        ? `${plural(summary.newTransactions, "new transaction", "new transactions")} added to your history.`
        : ALL_ALREADY_IMPORTED_MESSAGE,
    );
  }
  if (summary.overlapDuplicates > 0 && summary.newTransactions > 0) {
    lines.push(
      `${plural(summary.overlapDuplicates, "transaction was", "transactions were")} already in your history, so nothing was added twice.`,
    );
  }
  if (summary.possibleDuplicates > 0) {
    lines.push(
      `${plural(summary.possibleDuplicates, "transaction", "transactions")} might also appear in another statement. They are flagged so they are not counted twice.`,
    );
  }
  if (summary.needsPassword > 0) {
    lines.push(
      `${plural(summary.needsPassword, "statement needs", "statements need")} a password.`,
    );
  }
  if (summary.problems > 0) {
    lines.push(`${plural(summary.problems, "statement", "statements")} could not be saved.`);
  }
  if (summary.empty > 0) {
    lines.push(
      `${plural(summary.empty, "statement had", "statements had")} no transactions TracePay can use.`,
    );
  }
  return lines;
}

export function statementProgressLabel(
  position: number,
  total: number,
  fileName: string,
): string {
  return total > 1 ? `Statement ${position} of ${total} · ${fileName}` : fileName;
}

/** The service explains an account mismatch in plain words; detect it to offer a re-pick. */
export function isAccountMismatchMessage(message: string): boolean {
  return (
    /account ending \d{4}/i.test(message) ||
    /which you already have as/i.test(message) ||
    /which account this statement belongs to/i.test(message)
  );
}

const ACCOUNT_NAME_MAX = 80;

/**
 * A distinct, valid (2 to 80 characters) name for another account at the same bank:
 * "Capitec", then "Capitec account 2", "Capitec account 3" ...
 */
export function nextAccountName(
  bankName: string,
  existingNames: ReadonlyArray<string>,
): string {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const base = bankName.trim().slice(0, 60) || "Account";
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} account ${n}`.slice(0, ACCOUNT_NAME_MAX);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} account ${Date.now()}`.slice(0, ACCOUNT_NAME_MAX);
}
