import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { AccountError } from "./account.errors";
import {
  readAccountBalanceRow,
  type AccountBalanceSummary,
} from "./account-balance";
import {
  getAccountsSnapshot,
  resetAccountsSnapshot,
  setAccountsSnapshot,
} from "./account.store";
import type {
  CreateAccountInput,
  FinancialAccount,
} from "./account.types";
import {
  isValidAccountType,
  normalizeCreateAccountInput,
} from "./account.validation";

let accountsRequest: Promise<FinancialAccount[]> | null = null;
let mutationCounter = 0;

function readAccountRow(value: unknown): FinancialAccount | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as {
    id?: unknown;
    user_id?: unknown;
    name?: unknown;
    institution?: unknown;
    account_type?: unknown;
    currency?: unknown;
    last_four_digits?: unknown;
    connection_source?: unknown;
    created_at?: unknown;
    updated_at?: unknown;
  };

  if (
    typeof row.id !== "string" ||
    row.id.length === 0 ||
    typeof row.user_id !== "string" ||
    row.user_id.length === 0 ||
    typeof row.name !== "string" ||
    row.name.length === 0 ||
    typeof row.account_type !== "string" ||
    !isValidAccountType(row.account_type) ||
    typeof row.currency !== "string" ||
    row.currency.length !== 3 ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }

  const lastFourDigits =
    typeof row.last_four_digits === "string" ? row.last_four_digits : null;
  const connectionSource =
    row.connection_source === "open_banking" ||
    row.connection_source === "statement_import"
      ? row.connection_source
      : "manual";

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    institution: typeof row.institution === "string" ? row.institution : null,
    accountType: row.account_type,
    currency: row.currency,
    lastFourDigits,
    connectionSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readAccountRows(value: unknown): FinancialAccount[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row) => readAccountRow(row))
    .filter((row): row is FinancialAccount => row !== null);
}

export async function requireAuthenticatedUserId(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new AccountError(
      "Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    throw new AccountError("Sign in to manage your accounts.");
  }

  return data.user.id;
}

export async function listAccounts(): Promise<FinancialAccount[]> {
  await requireAuthenticatedUserId();

  const { data, error } = await getSupabase()
    .from("accounts")
    .select(
      "id, user_id, name, institution, account_type, currency, last_four_digits, connection_source, created_at, updated_at",
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new AccountError("Could not load your accounts. Please try again.");
  }

  return readAccountRows(data);
}

export async function loadAccountBalances(
  accountIds: readonly string[],
): Promise<Record<string, AccountBalanceSummary>> {
  await requireAuthenticatedUserId();
  if (accountIds.length === 0) return {};

  const { data, error } = await getSupabase().rpc("latest_account_balances", {
    account_ids: [...accountIds],
  });

  if (error) throw new AccountError("Could not load account balances. Please try again.");

  const balances: Record<string, AccountBalanceSummary> = {};
  for (const row of data ?? []) {
    const summary = readAccountBalanceRow(row);
    if (summary) {
      balances[summary.accountId] = summary;
    }
  }
  return balances;
}

export async function loadAccounts(fresh = false): Promise<FinancialAccount[]> {
  const current = getAccountsSnapshot();
  if (!fresh && current.initialized && !current.error) {
    return current.accounts;
  }
  if (accountsRequest) {
    return accountsRequest;
  }

  setAccountsSnapshot({
    accounts: current.accounts,
    loading: true,
    error: null,
    initialized: current.initialized,
  });

  accountsRequest = listAccounts()
    .then((accounts) => {
      setAccountsSnapshot({
        accounts,
        loading: false,
        error: null,
        initialized: true,
      });
      return accounts;
    })
    .catch((caught) => {
      setAccountsSnapshot({
        accounts: current.accounts,
        loading: false,
        error:
          caught instanceof AccountError
            ? caught.message
            : "Could not load your accounts. Please try again.",
        initialized: current.initialized,
      });
      return current.accounts;
    })
    .finally(() => {
      accountsRequest = null;
    });

  return accountsRequest;
}

export async function getAccountById(accountId: string): Promise<FinancialAccount | null> {
  await requireAuthenticatedUserId();
  if (!accountId) return null;

  const { data, error } = await getSupabase()
    .from("accounts")
    .select(
      "id, user_id, name, institution, account_type, currency, last_four_digits, connection_source, created_at, updated_at",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    throw new AccountError("Could not load this account.");
  }

  return readAccountRow(data);
}

export async function requireAccountForImport(
  accountId: string | null | undefined,
): Promise<FinancialAccount> {
  if (!accountId) {
    throw new AccountError("Choose an account before importing a statement.");
  }
  const account = await getAccountById(accountId);
  if (!account) {
    throw new AccountError("The selected account could not be found.");
  }
  return account;
}

export async function createAccount(
  input: CreateAccountInput,
): Promise<FinancialAccount> {
  const userId = await requireAuthenticatedUserId();
  let normalized;

  try {
    normalized = normalizeCreateAccountInput(input);
  } catch (caught) {
    throw new AccountError(
      caught instanceof Error ? caught.message : "Invalid account details.",
    );
  }

  const mutationId = ++mutationCounter;
  const { data, error } = await getSupabase()
    .from("accounts")
    .insert({
      user_id: userId,
      name: normalized.name,
      institution: normalized.institution,
      account_type: normalized.accountType,
      currency: normalized.currency,
      last_four_digits: normalized.lastFourDigits,
      connection_source: normalized.connectionSource,
    })
    .select(
      "id, user_id, name, institution, account_type, currency, last_four_digits, connection_source, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new AccountError("Could not add your account. Please try again.");
  }

  const account = readAccountRow(data);
  if (!account) {
    throw new AccountError("Could not read the new account. Please try again.");
  }

  if (mutationId === mutationCounter) {
    const current = getAccountsSnapshot();
    setAccountsSnapshot({
      accounts: [...current.accounts, account],
      loading: false,
      error: null,
      initialized: true,
    });
  }

  return account;
}

export async function deleteAccount(accountId: string): Promise<void> {
  const userId = await requireAuthenticatedUserId();

  if (!accountId) {
    throw new AccountError("Account not found.");
  }

  const supabase = getSupabase();
  const mutationId = ++mutationCounter;

  const { data: statements, error: statementsError } = await supabase
    .from("statement_imports")
    .select("file_path")
    .eq("account_id", accountId)
    .eq("user_id", userId);

  if (statementsError) {
    throw new AccountError("Could not remove your account. Please try again.");
  }

  const filePaths = (statements ?? [])
    .map((row) => (typeof row.file_path === "string" ? row.file_path : null))
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  const { data: deletedRows, error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", userId)
    .select("id");

  if (error || !deletedRows || deletedRows.length === 0) {
    throw new AccountError("Could not remove your account. Please try again.");
  }

  if (filePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("statements")
      .remove(filePaths);
    if (storageError) {
      console.warn("[TracePay][accounts] statement_storage_cleanup_failed", {
        accountId,
        count: filePaths.length,
      });
    }
  }

  if (mutationId === mutationCounter) {
    const current = getAccountsSnapshot();
    setAccountsSnapshot({
      accounts: current.accounts.filter((item) => item.id !== accountId),
      loading: false,
      error: null,
      initialized: true,
    });
  }
}

export { resetAccountsSnapshot };
