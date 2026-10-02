export const FINANCIAL_ACCOUNTS_SETUP_HREF =
  "/(auth)/financial-accounts-setup" as const;
export const IMPORT_SUCCESS_HREF = "/(auth)/import-success" as const;
export const ADD_ACCOUNT_HREF = "/settings/accounts/add" as const;
export const LINKED_ACCOUNTS_HREF = "/settings/accounts" as const;

const ALLOWED_RETURN_TO = new Set<string>([
  FINANCIAL_ACCOUNTS_SETUP_HREF,
  IMPORT_SUCCESS_HREF,
  "/(tabs)",
  "/(tabs)/transactions",
  LINKED_ACCOUNTS_HREF,
  ADD_ACCOUNT_HREF,
]);

export function parseReturnTo(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (ALLOWED_RETURN_TO.has(value)) {
    return value;
  }
  if (
    value.startsWith("/settings/accounts/") &&
    value.length > "/settings/accounts/".length
  ) {
    return value;
  }
  return null;
}

export function parseAccountId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}

export function accountSetupHref(
  accountId?: string | null,
  returnTo?: string | null,
): { pathname: typeof ADD_ACCOUNT_HREF; params: Record<string, string> } {
  const params: Record<string, string> = {};
  if (accountId) params.accountId = accountId;
  if (returnTo) params.returnTo = returnTo;
  return { pathname: ADD_ACCOUNT_HREF, params };
}
