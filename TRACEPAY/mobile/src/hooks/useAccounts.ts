import { useCallback, useEffect } from "react";

import type { AccountPreview } from "../components/dashboard/AccountsCard";
import { loadAccounts } from "../features/accounts/account.service";
import { useAccountsSnapshot } from "../features/accounts/account.store";
import { toAccountPreview } from "../features/accounts/account.validation";

export function useAccounts() {
  const snapshot = useAccountsSnapshot();

  const retry = useCallback(() => {
    void loadAccounts(true);
  }, []);

  useEffect(() => {
    void loadAccounts(false);
  }, []);

  const previews: AccountPreview[] = snapshot.accounts.map(toAccountPreview);

  return {
    accounts: snapshot.accounts,
    previews,
    loading: snapshot.loading,
    error: snapshot.error,
    retry,
  };
}

export type { AccountPreview };
