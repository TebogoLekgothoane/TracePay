export const FINANCIAL_ACCOUNTS_SETUP_HREF =
  "/(auth)/financial-accounts-setup" as const;
export const IMPORT_SUCCESS_HREF = "/(auth)/import-success" as const;
export const ADD_ACCOUNT_HREF = "/settings/accounts/add" as const;
export const LINKED_ACCOUNTS_HREF = "/settings/accounts" as const;
export const TRANSACTIONS_IMPORT_HREF = "/transactions/import" as const;

const ALLOWED_RETURN_TO = new Set<string>([
  FINANCIAL_ACCOUNTS_SETUP_HREF,
  IMPORT_SUCCESS_HREF,
  "/(tabs)",
  "/(tabs)/transactions",
  LINKED_ACCOUNTS_HREF,
]);

export function parseReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !ALLOWED_RETURN_TO.has(value)) {
    return null;
  }
  return value;
}

export function parseAccountId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}
