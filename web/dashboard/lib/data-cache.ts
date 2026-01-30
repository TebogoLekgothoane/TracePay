/**
 * Data cache utility for dashboard pages
 * Stores data in localStorage with timestamps to prevent unnecessary API calls
 */

interface CachedData<T> {
  data: T;
  timestamp: number;
  key: string;
}

const CACHE_PREFIX = "tracepay_dashboard_cache_";
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Get cached data if it exists and is still fresh
 */
export function getCachedData<T>(key: string, ttl: number = DEFAULT_CACHE_TTL): T | null {
  if (typeof window === "undefined") return null; // SSR safety

  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!cached) return null;

    const parsed: CachedData<T> = JSON.parse(cached);
    const now = Date.now();
    const age = now - parsed.timestamp;

    // Check if data is still fresh
    if (age < ttl) {
      return parsed.data;
    }

    // Data is stale, remove it
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    return null;
  } catch (error) {
    console.error(`Error reading cache for ${key}:`, error);
    return null;
  }
}

/**
 * Store data in cache with current timestamp
 */
export function setCachedData<T>(key: string, data: T): void {
  if (typeof window === "undefined") return; // SSR safety

  try {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
      key,
    };
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(cached));
  } catch (error) {
    console.error(`Error writing cache for ${key}:`, error);
    // If storage is full, try to clear old entries
    try {
      clearOldCacheEntries();
      localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({
        data,
        timestamp: Date.now(),
        key,
      }));
    } catch (retryError) {
      console.error(`Failed to cache after cleanup:`, retryError);
    }
  }
}

/**
 * Clear cached data for a specific key
 */
export function clearCachedData(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${CACHE_PREFIX}${key}`);
}

/**
 * Clear all cached dashboard data
 */
export function clearAllCache(): void {
  if (typeof window === "undefined") return;
  
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith(CACHE_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}

/**
 * Clear old cache entries (older than 1 hour)
 */
function clearOldCacheEntries(): void {
  const keys = Object.keys(localStorage);
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  
  keys.forEach((key) => {
    if (key.startsWith(CACHE_PREFIX)) {
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const parsed: CachedData<any> = JSON.parse(cached);
          if (parsed.timestamp < oneHourAgo) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // Invalid cache entry, remove it
        localStorage.removeItem(key);
      }
    }
  });
}

/**
 * Get cache age in milliseconds
 */
export function getCacheAge(key: string): number | null {
  if (typeof window === "undefined") return null;

  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!cached) return null;

    const parsed: CachedData<any> = JSON.parse(cached);
    return Date.now() - parsed.timestamp;
  } catch {
    return null;
  }
}

/**
 * Check if cache exists and is fresh
 */
export function isCacheFresh(key: string, ttl: number = DEFAULT_CACHE_TTL): boolean {
  const age = getCacheAge(key);
  return age !== null && age < ttl;
}

