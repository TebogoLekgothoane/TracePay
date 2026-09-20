import { useCallback, useEffect, useState } from "react";

import type { AccountPreview } from "../components/dashboard/AccountsCard";
import { loadAccountBalances, loadAccounts } from "../features/accounts/account.service";
import { useAccountsSnapshot } from "../features/accounts/account.store";
import { toAccountPreview } from "../features/accounts/account.validation";

export function useAccounts() {
  const snapshot = useAccountsSnapshot();
  const [balances, setBalances] = useState<Record<string, number>>({});

  const retry = useCallback(() => {
    void loadAccounts(true);
  }, []);

  useEffect(() => {
    void loadAccounts(false).then((accounts) => loadAccountBalances(accounts.map((account) => account.id))).then(setBalances).catch(() => setBalances({}));
  }, []);

  const previews: AccountPreview[] = snapshot.accounts.map((account) => toAccountPreview(account, balances[account.id] ?? null));

  return {
    accounts: snapshot.accounts,
    previews,
    loading: snapshot.loading,
    error: snapshot.error,
    retry,
  };
}

export type { AccountPreview };
