export type TransactionImportErrorCode =
  | "not_authenticated"
  | "file_access"
  | "not_csv"
  | "empty_csv"
  | "invalid_csv"
  | "unsupported_columns"
  | "malformed_csv"
  | "invalid_account"
  | "duplicate_import"
  | "network"
  | "timeout"
  | "cancelled"
  | "database"
  | "unknown";

export class TransactionImportError extends Error {
  readonly code: TransactionImportErrorCode;

  constructor(code: TransactionImportErrorCode, message: string) {
    super(message);
    this.name = "TransactionImportError";
    this.code = code;
  }
}

export function toTransactionImportError(error: unknown): TransactionImportError {
  if (error instanceof TransactionImportError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new TransactionImportError("cancelled", "The import was cancelled.");
  }

  return new TransactionImportError(
    "unknown",
    "Could not process this CSV file. Please try again.",
  );
}
