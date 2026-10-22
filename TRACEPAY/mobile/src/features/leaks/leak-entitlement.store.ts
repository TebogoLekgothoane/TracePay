import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";

// TODO(payments): this is a device-local flag until billing exists. Once the
// Annual Plan is sold through a payment provider, read the entitlement from the
// server (verified purchase) instead of trusting this value.
const STORAGE_KEY = "tracepay.leaks.unlocked.v1";

type LeakEntitlementSnapshot = {
  unlocked: boolean;
  hydrated: boolean;
};

let snapshot: LeakEntitlementSnapshot = {
  unlocked: false,
  hydrated: false,
};

let hydrateRequest: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: LeakEntitlementSnapshot): void {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): LeakEntitlementSnapshot {
  return snapshot;
}

export async function hydrateLeakEntitlement(): Promise<void> {
  if (snapshot.hydrated) {
    return;
  }
  if (hydrateRequest) {
    return hydrateRequest;
  }

  hydrateRequest = (async () => {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEY);
      setSnapshot({ unlocked: stored === "1", hydrated: true });
    } catch {
      setSnapshot({ unlocked: snapshot.unlocked, hydrated: true });
    } finally {
      hydrateRequest = null;
    }
  })();

  return hydrateRequest;
}

export async function setLeaksUnlocked(unlocked: boolean): Promise<void> {
  setSnapshot({ unlocked, hydrated: true });

  try {
    await SecureStore.setItemAsync(STORAGE_KEY, unlocked ? "1" : "0");
  } catch {
    // Keep the in-memory entitlement for this session if the device store is unavailable.
  }
}

export function useLeakEntitlement() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void hydrateLeakEntitlement();
  }, []);

  return {
    unlocked: current.unlocked,
    hydrated: current.hydrated,
  };
}
