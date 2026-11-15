import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useBilling } from "../billing/billing.store";

const STORAGE_KEY = "tracepay.leaks.soft_unlock.v1";

/**
 * Soft unlock after the simulated unlock celebration. ORs with a paid
 * full-analysis entitlement so existing buyers stay unlocked.
 */
type SoftSnapshot = {
  unlocked: boolean;
  hydrated: boolean;
};

let soft: SoftSnapshot = { unlocked: false, hydrated: false };
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setSoft(next: Partial<SoftSnapshot>): void {
  soft = { ...soft, ...next };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function hydrateSoftUnlock(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      // Accept the previous name-unlock key so existing sessions stay unlocked.
      const legacy =
        raw == null ? await AsyncStorage.getItem("tracepay.leaks.name_unlock.v1") : null;
      setSoft({ unlocked: raw === "1" || legacy === "1", hydrated: true });
    } catch {
      setSoft({ unlocked: false, hydrated: true });
    } finally {
      hydratePromise = null;
    }
  })();
  return hydratePromise;
}

export async function markLeaksUnlocked(): Promise<void> {
  setSoft({ unlocked: true, hydrated: true });
  try {
    await AsyncStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // In-memory unlock still applies for this session.
  }
}

export async function resetLeakSoftUnlock(): Promise<void> {
  setSoft({ unlocked: false, hydrated: true });
  try {
    await AsyncStorage.multiRemove([STORAGE_KEY, "tracepay.leaks.name_unlock.v1"]);
  } catch {
    // Memory flag is cleared either way.
  }
}

export function useLeakEntitlement() {
  const billing = useBilling();
  const softState = useSyncExternalStore(subscribe, () => soft, () => soft);

  useEffect(() => {
    if (!softState.hydrated) void hydrateSoftUnlock();
  }, [softState.hydrated]);

  const unlockFindings = useCallback(async () => {
    await markLeaksUnlocked();
  }, []);

  return {
    unlocked: billing.entitlements?.fullAnalysis.unlocked === true || softState.unlocked,
    hydrated: billing.hydrated && softState.hydrated,
    error: billing.error,
    unlockFindings,
  };
}
