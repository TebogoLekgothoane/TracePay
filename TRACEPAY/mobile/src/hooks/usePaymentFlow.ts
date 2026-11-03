import { useCallback, useEffect, useRef, useState } from "react";

import { BillingApiError, syncStorePurchases } from "../api/billing.api";
import { applyEntitlements, refreshBilling } from "../features/billing/billing.store";
import type { BillingEntitlements, BillingProduct } from "../features/billing/billing.types";
import { getSupabase } from "../lib/supabase";
import {
  PurchaseCancelledError,
  PurchaseError,
  purchaseProduct,
  restoreStorePurchases,
} from "../lib/revenuecat";

export type PaymentPhase =
  | "idle"
  /** The store sheet is open or the purchase is being submitted. */
  | "starting"
  /** Bought in the store; waiting for the backend to confirm it. */
  | "verifying"
  | "success"
  /** The user closed the store sheet without paying. */
  | "cancelled"
  /** The store accepted the purchase but our backend has not confirmed it yet. */
  | "delayed"
  | "error";

const VERIFY_ATTEMPTS = 4;
const VERIFY_GAP_MS = 2_500;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function owns(entitlements: BillingEntitlements, product: BillingProduct): boolean {
  return product === "annual_monitoring"
    ? entitlements.monitoring.active
    : entitlements.fullAnalysis.unlocked;
}

async function currentUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (error || !id) throw new BillingApiError("Sign in again to continue.", 401);
  return id;
}

/**
 * Drives one in-app purchase through RevenueCat. Success is only ever set from the
 * backend's answer (it re-reads the purchase from RevenueCat), never from the store
 * sheet closing or the SDK's own customer info.
 */
export function usePaymentFlow(product: BillingProduct) {
  const [phase, setPhase] = useState<PaymentPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Ask the backend until it reports the product as owned. Returns false if it never does. */
  const confirm = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
      const entitlements = await syncStorePurchases();
      applyEntitlements(entitlements);
      if (owns(entitlements, product)) return true;
      if (attempt < VERIFY_ATTEMPTS - 1) await wait(VERIFY_GAP_MS);
    }
    return false;
  }, [product]);

  const fail = useCallback((error: unknown, fallback: string) => {
    if (!mounted.current) return;
    setPhase("error");
    setMessage(
      error instanceof BillingApiError || error instanceof PurchaseError ? error.message : fallback,
    );
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setPhase("starting");
    setMessage(null);
    try {
      await purchaseProduct(await currentUserId(), product);
      if (mounted.current) setPhase("verifying");
      const confirmed = await confirm();
      if (!mounted.current) return;
      if (confirmed) {
        setPhase("success");
        return;
      }
      setPhase("delayed");
      setMessage(
        "The store has your payment, but we have not confirmed it yet. Your access unlocks automatically as soon as it arrives.",
      );
    } catch (error) {
      if (error instanceof PurchaseCancelledError) {
        if (mounted.current) {
          setPhase("cancelled");
          setMessage(null);
        }
        return;
      }
      fail(error, "Could not complete the purchase. Please try again.");
    } finally {
      busy.current = false;
    }
  }, [confirm, fail, product]);

  /** Re-check with the backend, e.g. after a delayed confirmation. */
  const verify = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setPhase("verifying");
    setMessage(null);
    try {
      const confirmed = await confirm();
      if (!mounted.current) return;
      if (confirmed) {
        setPhase("success");
      } else {
        setPhase("delayed");
        setMessage("Still waiting for the store to confirm. Try again in a moment.");
      }
    } catch (error) {
      fail(error, "Could not check your purchase.");
    } finally {
      busy.current = false;
    }
  }, [confirm, fail]);

  /** Required by the stores: bring back purchases made on this store account. */
  const restore = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setPhase("verifying");
    setMessage(null);
    try {
      await restoreStorePurchases(await currentUserId());
      const entitlements = await syncStorePurchases();
      applyEntitlements(entitlements);
      if (!mounted.current) return;
      if (owns(entitlements, product) || entitlements.fullAnalysis.unlocked) {
        setPhase("success");
      } else {
        setPhase("idle");
        setMessage("We could not find any earlier purchases for this store account.");
      }
    } catch (error) {
      fail(error, "Could not restore your purchases.");
    } finally {
      busy.current = false;
    }
  }, [fail, product]);

  const resume = useCallback(async (): Promise<void> => {
    await refreshBilling();
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setMessage(null);
  }, []);

  return { phase, message, start, verify, restore, resume, reset };
}
