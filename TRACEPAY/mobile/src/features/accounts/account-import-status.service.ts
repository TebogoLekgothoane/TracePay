import { getSupabase } from "../../lib/supabase";
import { AccountError } from "./account.errors";
import { requireAuthenticatedUserId } from "./account.service";
import type { FinancialAccount } from "./account.types";

const REQUEST_TIMEOUT_MS = 12000;

export type AccountImportStatus = {
  accountId: string;
  transactionCount: number;
  lastImportedAt: string | null;
  hasTransactions: boolean;
};

function withTimeout<T>(
  run: () => PromiseLike<T>,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AccountError(message));
    }, REQUEST_TIMEOUT_MS);

    void Promise.resolve(run())
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function loadSingleAccountStatus(
  accountId: string,
): Promise<AccountImportStatus> {
  const supabase = getSupabase();
  const [transactionsResult, importsResult] = await Promise.all([
    withTimeout(
      () =>
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId),
      "Loading transaction counts took too long. Please try again.",
    ),
    withTimeout(
      () =>
        supabase
          .from("imports")
          .select("completed_at")
          .eq("account_id", accountId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1),
      "Loading import history took too long. Please try again.",
    ),
  ]);

  if (transactionsResult.error || importsResult.error) {
    throw new AccountError(
      "Could not load your account import status. Please try again.",
    );
  }

  const transactionCount = transactionsResult.count ?? 0;
  const latestImport = Array.isArray(importsResult.data)
    ? importsResult.data[0]
    : null;

  return {
    accountId,
    transactionCount,
    lastImportedAt:
      latestImport &&
      typeof latestImport.completed_at === "string" &&
      latestImport.completed_at.length > 0
        ? latestImport.completed_at
        : null,
    hasTransactions: transactionCount > 0,
  };
}

export async function loadAccountImportStatuses(
  accounts: readonly FinancialAccount[],
): Promise<Record<string, AccountImportStatus>> {
  await requireAuthenticatedUserId();

  if (accounts.length === 0) {
    return {};
  }

  const results = await Promise.all(
    accounts.map((account) => loadSingleAccountStatus(account.id)),
  );

  return Object.fromEntries(results.map((status) => [status.accountId, status]));
}

export function formatTransactionCountLabel(count: number): string {
  const formatted = new Intl.NumberFormat("en-ZA").format(count);
  return `${formatted} transaction${count === 1 ? "" : "s"}`;
}
