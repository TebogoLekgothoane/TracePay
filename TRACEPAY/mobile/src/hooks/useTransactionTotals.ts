import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { loadTransactionTotals } from "../features/transactions/transaction.service";
import {
  ALL_ACCOUNTS_KEY,
  type TransactionTotals,
} from "../features/transactions/transaction.totals";

let cached: Record<string, TransactionTotals> | null = null;

export function invalidateTransactionTotals(): void {
  cached = null;
}

/** Totals for the selected account filter (or all accounts), refreshed quietly on focus. */
export function useTransactionTotals(accountId: string | null) {
  const [all, setAll] = useState(cached);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const id = ++requestId.current;
      void loadTransactionTotals()
        .then((totals) => {
          if (requestId.current !== id) return;
          cached = totals;
          setAll(totals);
          setError(false);
        })
        .catch(() => {
          if (requestId.current === id && !cached) setError(true);
        });
      return () => {
        requestId.current += 1;
      };
    }, []),
  );

  const key = accountId ?? ALL_ACCOUNTS_KEY;
  return {
    totals: all ? (all[key] ?? { spent: 0, income: 0, count: 0 }) : null,
    loading: all === null && !error,
    error,
  };
}
