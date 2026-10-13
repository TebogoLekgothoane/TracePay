import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import {
  listRecentTransactionsPage,
  TRANSACTION_PAGE_SIZE,
} from "../features/transactions/transaction.service";
import type { TransactionRow } from "../features/transactions/transaction.types";

export function useTransactions(accountId?: string | null) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);

  const loadInitial = useCallback(() => {
    const id = ++requestId.current;
    loadingMoreRef.current = false;
    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);

    void listRecentTransactionsPage({
      limit: TRANSACTION_PAGE_SIZE,
      offset: 0,
      accountId,
    })
      .then((page) => {
        if (requestId.current !== id) return;
        setError(null);
        setTransactions(page.rows);
        setHasMore(page.hasMore);
      })
      .catch((caught: unknown) => {
        if (requestId.current !== id) return;
        setTransactions([]);
        setHasMore(false);
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
  }, [accountId]);

  const loadMore = useCallback(() => {
    if (loading || loadingMoreRef.current || !hasMore) {
      return;
    }

    const id = requestId.current;
    const offset = transactions.length;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    void listRecentTransactionsPage({
      limit: TRANSACTION_PAGE_SIZE,
      offset,
      accountId,
    })
      .then((page) => {
        if (requestId.current !== id) return;
        setError(null);
        setTransactions((current) => {
          if (current.length !== offset) {
            return current;
          }
          const seen = new Set(current.map((row) => row.id));
          const next = page.rows.filter((row) => !seen.has(row.id));
          return next.length === 0 ? current : [...current, ...next];
        });
        setHasMore(page.hasMore);
      })
      .catch((caught: unknown) => {
        if (requestId.current !== id) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load more transactions.",
        );
      })
      .finally(() => {
        if (requestId.current === id) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      });
  }, [accountId, hasMore, loading, transactions.length]);

  useFocusEffect(
    useCallback(() => {
      loadInitial();
      return () => {
        requestId.current += 1;
        loadingMoreRef.current = false;
      };
    }, [loadInitial]),
  );

  return {
    transactions,
    loading,
    loadingMore,
    hasMore,
    error,
    retry: loadInitial,
    loadMore,
    pageSize: TRANSACTION_PAGE_SIZE,
  };
}
