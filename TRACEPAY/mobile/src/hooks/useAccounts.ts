import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import type { AccountPreview } from "../components/dashboard/AccountsCard";
import {
  formatAccountBalanceAsOfLabel,
  summarizeStatementBalances,
  type AccountBalanceSummary,
} from "../features/accounts/account-balance";
import { loadAccountBalances, loadAccounts } from "../features/accounts/account.service";
import { useAccountsSnapshot } from "../features/accounts/account.store";
import { toAccountPreview } from "../features/accounts/account.validation";

export function useAccounts() {
  const snapshot = useAccountsSnapshot();
  const [balances, setBalances] = useState<Record<string, AccountBalanceSummary>>(
    {},
  );

  const retry = useCallback(() => {
    void loadAccounts(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void loadAccounts(false)
        .then((accounts) => loadAccountBalances(accounts.map((account) => account.id)))
        .then((next) => {
          if (!cancelled) {
            setBalances(next);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setBalances({});
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const previews: AccountPreview[] = snapshot.accounts.map((account) => {
    const summary = balances[account.id];
    return toAccountPreview(account, summary?.amount ?? null, {
      asOfLabel: formatAccountBalanceAsOfLabel(summary?.asOfDate ?? null),
      hasWarning: summary?.hasWarning ?? false,
    });
  });

  const balanceTotals = useMemo(
    () => summarizeStatementBalances(Object.values(balances)),
    [balances],
  );

  return {
    accounts: snapshot.accounts,
    previews,
    balances,
    balanceTotals,
    loading: snapshot.loading,
    error: snapshot.error,
    retry,
  };
}

export type { AccountPreview };
