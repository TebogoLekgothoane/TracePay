import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { listRecentTransactions } from "../features/transactions/transaction.service";
import type { TransactionRow } from "../features/transactions/transaction.types";

export function useTransactions() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    void listRecentTransactions()
      .then((rows) => {
        if (requestId.current !== id) return;
        setError(null);
        setTransactions(rows);
      })
      .catch((caught: unknown) => {
        if (requestId.current !== id) return;
        setTransactions([]);
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load your imported transactions.",
        );
      })
      .finally(() => {
        if (requestId.current === id) {
          setLoading(false);
        }
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        requestId.current += 1;
      };
    }, [load]),
  );

  return {
    transactions,
    loading,
    error,
    retry: load,
  };
}
