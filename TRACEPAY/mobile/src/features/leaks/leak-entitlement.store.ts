import { useBilling } from "../billing/billing.store";

/**
 * Whether the signed-in user has paid for the full analysis. This is read from the
 * backend (a verified purchase), never from a flag stored on the device.
 */
export function useLeakEntitlement() {
  const { entitlements, hydrated, error } = useBilling();
  return {
    unlocked: entitlements?.fullAnalysis.unlocked === true,
    hydrated,
    error,
  };
}
