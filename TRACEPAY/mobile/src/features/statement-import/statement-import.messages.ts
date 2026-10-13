/** User-facing copy for statement import outcomes that aren't hard failures. */

export const NO_TRANSACTIONS_FOUND_MESSAGE =
  "We opened this statement, but it doesn't include any transactions TracePay can use. Upload a statement with your transaction history to continue.";

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
  return isNoTransactionsImportMessage(message) ? "info" : "error";
}
