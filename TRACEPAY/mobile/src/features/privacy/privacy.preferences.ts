import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";

const HIDE_BALANCES_KEY = "tracepay.privacy.hide-balances.v1";

type PrivacyPreferencesSnapshot = {
  hideBalances: boolean;
  hydrated: boolean;
};

let snapshot: PrivacyPreferencesSnapshot = {
  hideBalances: false,
  hydrated: false,
};

let hydrateRequest: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: PrivacyPreferencesSnapshot): void {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PrivacyPreferencesSnapshot {
  return snapshot;
}

export async function hydratePrivacyPreferences(): Promise<void> {
  if (snapshot.hydrated) {
    return;
  }
  if (hydrateRequest) {
    return hydrateRequest;
  }

  hydrateRequest = (async () => {
    try {
      const stored = await AsyncStorage.getItem(HIDE_BALANCES_KEY);
      setSnapshot({
        hideBalances: stored === "1",
        hydrated: true,
      });
    } catch {
      setSnapshot({
        hideBalances: false,
        hydrated: true,
      });
    } finally {
      hydrateRequest = null;
    }
  })();

  return hydrateRequest;
}

export async function setHideBalances(hideBalances: boolean): Promise<void> {
  setSnapshot({
    hideBalances,
    hydrated: true,
  });

  try {
    await AsyncStorage.setItem(HIDE_BALANCES_KEY, hideBalances ? "1" : "0");
  } catch {
    // Keep in-memory preference even if persistence fails.
  }
}

export function usePrivacyPreferences() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void hydratePrivacyPreferences();
  }, []);

  const toggleHideBalances = useCallback(async () => {
    await setHideBalances(!getSnapshot().hideBalances);
  }, []);

  const updateHideBalances = useCallback(async (value: boolean) => {
    await setHideBalances(value);
  }, []);

  return {
    hideBalances: current.hideBalances,
    hydrated: current.hydrated,
    setHideBalances: updateHideBalances,
    toggleHideBalances,
  };
}
