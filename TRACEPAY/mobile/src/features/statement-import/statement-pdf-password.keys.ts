const STORAGE_PREFIX = "tracepay.statement.pdf-password.v1.";
const ACCOUNT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertStatementPasswordAccountId(accountId: string): string {
  const trimmed = accountId.trim();
  if (!ACCOUNT_ID_PATTERN.test(trimmed)) {
    throw new Error("Invalid account id for statement password storage.");
  }
  return trimmed;
}

export function statementPdfPasswordStorageKey(accountId: string): string {
  return `${STORAGE_PREFIX}${assertStatementPasswordAccountId(accountId)}`;
}
