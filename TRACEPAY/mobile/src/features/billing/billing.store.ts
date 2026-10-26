import { useCallback, useEffect, useSyncExternalStore } from "react";

import { fetchBillingProducts, fetchEntitlements } from "../../api/billing.api";
import type { BillingEntitlements, BillingProducts } from "./billing.types";

/**
 * Server truth only. Nothing here is persisted on the device: access is re-read from
 * the backend, so it follows the signed-in account and cannot be forged locally.
 */
type Snapshot = {
  products: BillingProducts | null;
  entitlements: BillingEntitlements | null;
  hydrated: boolean;
  error: string | null;
};

let snapshot: Snapshot = { products: null, entitlements: null, hydrated: false, error: null };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<Snapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

export function applyEntitlements(entitlements: BillingEntitlements): void {
  set({ entitlements, hydrated: true, error: null });
}

export function resetBilling(): void {
  snapshot = { products: null, entitlements: null, hydrated: false, error: null };
  for (const listener of listeners) listener();
}

export function refreshBilling(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // Independent requests: a failed entitlement lookup must not hide the price.
    const [products, entitlements] = await Promise.allSettled([
      snapshot.products ? Promise.resolve(snapshot.products) : fetchBillingProducts(),
      fetchEntitlements(),
    ]);
    const failure = [products, entitlements].find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    try {
      set({
        products: products.status === "fulfilled" ? products.value : snapshot.products,
        entitlements: entitlements.status === "fulfilled" ? entitlements.value : snapshot.entitlements,
        hydrated: true,
        error: failure
          ? failure.reason instanceof Error
            ? failure.reason.message
            : "Could not load your plan."
          : null,
      });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBilling() {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
  useEffect(() => {
    if (!snapshot.hydrated) void refreshBilling();
  }, []);
  const refresh = useCallback(() => refreshBilling(), []);
  return { ...current, refresh };
}
