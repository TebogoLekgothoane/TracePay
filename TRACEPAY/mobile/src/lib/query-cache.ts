import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

/**
 * A small stale-while-revalidate cache for screen data.
 *
 * A screen shows what it already has the moment it opens, and quietly refreshes in the
 * background when that data is older than `staleMs`. A skeleton only appears the very
 * first time, when there is nothing to show. The cache is held in memory, so it is
 * emptied on sign-out and never outlives the app session.
 */

type Entry = {
  data?: unknown;
  error?: string;
  fetchedAt: number;
  fetching: boolean;
  /** Set when something changed on the server, so the next visit must refresh. */
  stale: boolean;
};

const DEFAULT_STALE_MS = 60_000;
const store = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const inFlight = new Map<string, Promise<void>>();

function notify(key: string): void {
  listeners.get(key)?.forEach((listener) => listener());
}

function put(key: string, entry: Entry): void {
  store.set(key, entry);
  notify(key);
}

function subscribeTo(key: string) {
  return (listener: () => void) => {
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  };
}

/** Mark cached data out of date after a change (an import, a deleted account). Keeps it on screen. */
export function invalidateQueries(prefix = ""): void {
  for (const [key, entry] of store) {
    if (key.startsWith(prefix)) put(key, { ...entry, stale: true });
  }
}

/** Forget everything, for sign-out or an account switch. */
export function clearQueryCache(): void {
  const keys = [...store.keys()];
  store.clear();
  inFlight.clear();
  keys.forEach(notify);
}

export function peekQuery<T>(key: string): T | null {
  return (store.get(key)?.data as T | undefined) ?? null;
}

type Options = {
  staleMs?: number;
  enabled?: boolean;
};

export function useCachedQuery<T>(key: string, fetcher: () => Promise<T>, options: Options = {}) {
  const { staleMs = DEFAULT_STALE_MS, enabled = true } = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const subscribe = useMemo(() => subscribeTo(key), [key]);
  const entry = useSyncExternalStore(
    subscribe,
    () => store.get(key),
    () => store.get(key),
  );

  const run = useCallback(
    (force: boolean): Promise<void> => {
      const current = store.get(key);
      const fresh =
        current?.data !== undefined && !current.stale && Date.now() - current.fetchedAt < staleMs;
      if (!force && fresh) return Promise.resolve();
      const pending = inFlight.get(key);
      if (pending) return pending;

      put(key, { ...(current ?? { fetchedAt: 0, stale: false }), fetching: true });
      const request = fetcherRef
        .current()
        .then((data) => {
          put(key, { data, fetchedAt: Date.now(), fetching: false, stale: false });
        })
        .catch((caught: unknown) => {
          const latest = store.get(key);
          put(key, {
            ...(latest ?? { fetchedAt: 0, stale: false }),
            fetching: false,
            error: caught instanceof Error ? caught.message : "Could not load this right now.",
          });
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, request);
      return request;
    },
    [key, staleMs],
  );

  // Refresh when the screen comes into view, and when the key changes while it is visible.
  useFocusEffect(
    useCallback(() => {
      if (enabled) void run(false);
    }, [enabled, run]),
  );
  useEffect(() => {
    if (enabled && !inFlight.has(key)) void run(false);
  }, [enabled, key, run]);

  const hasData = entry?.data !== undefined;
  return {
    data: hasData ? (entry?.data as T) : null,
    /** True only while there is nothing to show yet. */
    loading: enabled && !hasData && (entry?.fetching ?? true) && !entry?.error,
    /** True while a background refresh runs behind data that is already on screen. */
    refreshing: hasData && Boolean(entry?.fetching),
    /** Only reported when there is nothing cached to fall back on. */
    error: hasData ? null : (entry?.error ?? null),
    retry: () => void run(true),
  };
}
