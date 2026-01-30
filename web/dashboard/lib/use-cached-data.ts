import { useState, useEffect, useCallback } from "react";
import { getCachedData, setCachedData, isCacheFresh } from "./data-cache";

interface UseCachedDataOptions {
  /**
   * Cache key - should be unique per data type
   */
  cacheKey: string;
  /**
   * Function that fetches the data
   */
  fetchFn: () => Promise<any>;
  /**
   * Cache TTL in milliseconds (default: 5 minutes)
   */
  ttl?: number;
  /**
   * Whether to fetch immediately on mount (default: true)
   */
  fetchOnMount?: boolean;
  /**
   * Whether to use cached data if available (default: true)
   */
  useCache?: boolean;
}

interface UseCachedDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  isFetching: boolean;
  cacheAge: number | null;
}

/**
 * Custom hook for fetching and caching data
 * Automatically uses cached data if available and fresh
 */
export function useCachedData<T = any>({
  cacheKey,
  fetchFn,
  ttl = 5 * 60 * 1000, // 5 minutes default
  fetchOnMount = true,
  useCache = true,
}: UseCachedDataOptions): UseCachedDataReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const getCacheAge = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = localStorage.getItem(`tracepay_dashboard_cache_${cacheKey}`);
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return Date.now() - parsed.timestamp;
    } catch {
      return null;
    }
  }, [cacheKey]);

  const [cacheAge, setCacheAge] = useState<number | null>(null);

  const fetchData = useCallback(
    async (force = false) => {
      // Check cache first if not forcing refresh
      if (useCache && !force) {
        const cached = getCachedData<T>(cacheKey, ttl);
        if (cached !== null) {
          setData(cached);
          setLoading(false);
          setError(null);
          setCacheAge(getCacheAge());
          return;
        }
      }

      // Prevent concurrent calls
      if (isFetching) return;

      setIsFetching(true);
      setLoading(true);
      setError(null);

      try {
        const result = await fetchFn();
        setData(result);
        
        // Cache the result
        if (useCache) {
          setCachedData(cacheKey, result);
        }
        
        setCacheAge(getCacheAge());
      } catch (err: any) {
        const errorMessage = err?.message || "Failed to fetch data";
        setError(errorMessage);
        console.error(`Error fetching ${cacheKey}:`, err);
      } finally {
        setLoading(false);
        setIsFetching(false);
      }
    },
    [cacheKey, fetchFn, ttl, useCache, isFetching, getCacheAge]
  );

  useEffect(() => {
    if (fetchOnMount) {
      void fetchData();
    }
  }, [fetchOnMount]); // Only run on mount

  // Update cache age periodically when data is loaded
  useEffect(() => {
    if (data && useCache) {
      const interval = setInterval(() => {
        setCacheAge(getCacheAge());
      }, 1000); // Update every second

      return () => clearInterval(interval);
    }
  }, [data, useCache, getCacheAge]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
    isFetching,
    cacheAge,
  };
}

