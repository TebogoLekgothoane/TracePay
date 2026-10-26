import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import {
  listRecentTransactionsPage,
  TRANSACTION_PAGE_SIZE,
} from "../features/transactions/transaction.service";
import type { TransactionRow } from "../features/transactions/transaction.types";

type CachedList = { rows: TransactionRow[]; hasMore: boolean };

/** Last list seen for each account filter, so coming back to the tab shows it at once. */
const listCache = new Map<string, CachedList>();

export function invalidateTransactionLists(): void {
  listCache.clear();
}

export function useTransactions(accountId?: string | null) {
  const cacheKey = accountId ?? "all";
  const [transactions, setTransactions] = useState<TransactionRow[]>(() => listCache.get(accountId ?? "all")?.rows ?? []);
  const [loading, setLoading] = useState(() => !listCache.has(accountId ?? "all"));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);

  const loadInitial = useCallback(() => {
    const id = ++requestId.current;
    loadingMoreRef.current = false;
    const cached = listCache.get(cacheKey);
    // With something to show, refresh quietly instead of replacing the list with a skeleton.
    setLoading(!cached);
    setLoadingMore(false);
    if (cached) {
      setTransactions(cached.rows);
      setHasMore(cached.hasMore);
    } else {
      setHasMore(false);
    }

    void listRecentTransactionsPage({
      limit: TRANSACTION_PAGE_SIZE,
      offset: 0,
      accountId,
    })
      .then((page) => {
        if (requestId.current !== id) return;
        setError(null);
        const earlier = listCache.get(cacheKey);
        // Keep pages the user already scrolled to; only the newest page is replaced.
        const rows =
          earlier && earlier.rows.length > page.rows.length
            ? [...page.rows, ...earlier.rows.slice(page.rows.length).filter((row) => !page.rows.some((fresh) => fresh.id === row.id))]
            : page.rows;
        const hasMore = earlier && earlier.rows.length > page.rows.length ? earlier.hasMore : page.hasMore;
        listCache.set(cacheKey, { rows, hasMore });
        setTransactions(rows);
        setHasMore(hasMore);
      })
      .catch((caught: unknown) => {
        if (requestId.current !== id) return;
        if (listCache.has(cacheKey)) return;
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
  }, [accountId, cacheKey]);

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
          const merged = next.length === 0 ? current : [...current, ...next];
          listCache.set(cacheKey, { rows: merged, hasMore: page.hasMore });
          return merged;
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
  }, [accountId, cacheKey, hasMore, loading, transactions.length]);

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
