import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { normaliseMerchantKey } from "./kept-payments";

const STORAGE_KEY = "tracepay.kept-recurring-payments.v1";
const MAX_KEPT = 200;

type Snapshot = { keys: readonly string[]; hydrated: boolean };

let snapshot: Snapshot = { keys: [], hydrated: false };
let hydrateRequest: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setSnapshot(next: Snapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function parseKeys(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normaliseMerchantKey)
      .filter(Boolean)
      .slice(0, MAX_KEPT);
  } catch {
    return [];
  }
}

async function hydrate(): Promise<void> {
  if (snapshot.hydrated) return;
  if (hydrateRequest) return hydrateRequest;
  hydrateRequest = (async () => {
    try {
      setSnapshot({ keys: parseKeys(await AsyncStorage.getItem(STORAGE_KEY)), hydrated: true });
    } catch {
      setSnapshot({ ...snapshot, hydrated: true });
    } finally {
      hydrateRequest = null;
    }
  })();
  return hydrateRequest;
}

async function update(next: string[]): Promise<void> {
  setSnapshot({ keys: next, hydrated: true });
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the in-memory choice if saving fails.
  }
}

/** Recurring payments the user said they use, so they are not counted as leaks. */
export function useKeptPayments() {
  useEffect(() => {
    void hydrate();
  }, []);
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const kept = useMemo(() => new Set(state.keys), [state.keys]);

  const keep = useCallback(async (merchant: string) => {
    const key = normaliseMerchantKey(merchant);
    if (!key || snapshot.keys.includes(key)) return;
    await update([key, ...snapshot.keys].slice(0, MAX_KEPT));
  }, []);
  const unkeep = useCallback(async (merchant: string) => {
    const key = normaliseMerchantKey(merchant);
    await update(snapshot.keys.filter((item) => item !== key));
  }, []);

  return { kept, hydrated: state.hydrated, keep, unkeep };
}
