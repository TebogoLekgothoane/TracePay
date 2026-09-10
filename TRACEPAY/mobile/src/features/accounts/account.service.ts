import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { AccountError } from "./account.errors";
import {
  getAccountsSnapshot,
  resetAccountsSnapshot,
  setAccountsSnapshot,
} from "./account.store";
import type {
  CreateAccountInput,
  FinancialAccount,
  UpdateAccountInput,
} from "./account.types";
import {
  isValidAccountName,
  isValidAccountType,
  isValidInstitution,
  normalizeCreateAccountInput,
  sanitizeAccountName,
  sanitizeInstitution,
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

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    institution: typeof row.institution === "string" ? row.institution : null,
    accountType: row.account_type,
    currency: row.currency,
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
      "id, user_id, name, institution, account_type, currency, created_at, updated_at",
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new AccountError("Could not load your accounts. Please try again.");
  }

  return readAccountRows(data);
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

export async function ensureBankAccount(
  institution: string,
): Promise<FinancialAccount> {
  const bank = sanitizeInstitution(institution);
  if (!bank) {
    throw new AccountError("Choose a bank before uploading a statement.");
  }

  const accounts = await listAccounts();
  const existing = accounts.find((account) => {
    const institutionName = (account.institution ?? "").trim().toLowerCase();
    const accountName = account.name.trim().toLowerCase();
    const target = bank.toLowerCase();
    return institutionName === target || accountName === target;
  });

  if (existing) {
    return existing;
  }

  return createAccount({
    name: bank,
    institution: bank,
    accountType: "cheque",
  });
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
    })
    .select(
      "id, user_id, name, institution, account_type, currency, created_at, updated_at",
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

export async function updateAccount(
  input: UpdateAccountInput,
): Promise<FinancialAccount> {
  await requireAuthenticatedUserId();

  const patch: Record<string, string | null> = {};
  if (input.name !== undefined) {
    const name = sanitizeAccountName(input.name);
    if (!isValidAccountName(name)) {
      throw new AccountError("Enter an account name between 2 and 80 characters.");
    }
    patch.name = name;
  }

  if (input.institution !== undefined) {
    if (input.institution === null || input.institution.trim() === "") {
      patch.institution = null;
    } else {
      const institution = sanitizeInstitution(input.institution);
      if (!isValidInstitution(institution)) {
        throw new AccountError("Institution must be between 2 and 80 characters.");
      }
      patch.institution = institution;
    }
  }

  if (input.accountType !== undefined) {
    if (!isValidAccountType(input.accountType)) {
      throw new AccountError("Choose a valid account type.");
    }
    patch.account_type = input.accountType;
  }

  if (Object.keys(patch).length === 0) {
    throw new AccountError("Nothing to update.");
  }

  const mutationId = ++mutationCounter;
  const { data, error } = await getSupabase()
    .from("accounts")
    .update(patch)
    .eq("id", input.id)
    .select(
      "id, user_id, name, institution, account_type, currency, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new AccountError("Could not update your account. Please try again.");
  }

  const account = readAccountRow(data);
  if (!account) {
    throw new AccountError("Could not read the updated account. Please try again.");
  }

  if (mutationId === mutationCounter) {
    const current = getAccountsSnapshot();
    setAccountsSnapshot({
      accounts: current.accounts.map((item) =>
        item.id === account.id ? account : item,
      ),
      loading: false,
      error: null,
      initialized: true,
    });
  }

  return account;
}

export async function deleteAccount(accountId: string): Promise<void> {
  await requireAuthenticatedUserId();

  if (!accountId) {
    throw new AccountError("Account not found.");
  }

  const mutationId = ++mutationCounter;
  const { error } = await getSupabase()
    .from("accounts")
    .delete()
    .eq("id", accountId);

  if (error) {
    throw new AccountError("Could not remove your account. Please try again.");
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
