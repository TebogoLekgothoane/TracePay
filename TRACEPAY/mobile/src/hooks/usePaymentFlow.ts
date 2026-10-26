import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";

import { BillingApiError, startCheckout, verifyPayment } from "../api/billing.api";
import { applyEntitlements, refreshBilling } from "../features/billing/billing.store";
import type { BillingProduct } from "../features/billing/billing.types";

export type PaymentPhase =
  | "idle"
  | "starting"
  /** The provider's checkout is open; waiting for the user to come back. */
  | "awaiting"
  | "verifying"
  | "success"
  /** The provider reported a failure or the user left without paying. */
  | "failed"
  /** Paid or possibly paid, but the provider has not confirmed yet. */
  | "delayed"
  | "error";

const VERIFY_ATTEMPTS = 4;
const VERIFY_GAP_MS = 2_500;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Drives one purchase through the provider's hosted checkout. Success is only ever set
 * from the backend's verified answer, never from the checkout page closing.
 */
export function usePaymentFlow(product: BillingProduct) {
  const [phase, setPhase] = useState<PaymentPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const reference = useRef<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const verify = useCallback(async (): Promise<void> => {
    const ref = reference.current;
    if (!ref || busy.current) return;
    busy.current = true;
    setPhase("verifying");
    setMessage(null);
    try {
      for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
        const result = await verifyPayment(ref);
        applyEntitlements(result.entitlements);
        if (!mounted.current) return;
        if (result.status === "succeeded") {
          setPhase("success");
          return;
        }
        if (result.status === "failed" || result.status === "abandoned" || result.status === "refunded") {
          setPhase("failed");
          setMessage(
            result.status === "abandoned"
              ? "The payment was not completed. You have not been charged."
              : "The payment did not go through. You have not been charged.",
          );
          return;
        }
        if (attempt < VERIFY_ATTEMPTS - 1) await wait(VERIFY_GAP_MS);
      }
      setPhase("delayed");
      setMessage(
        "We have not received confirmation yet. If you paid, your access unlocks automatically as soon as it arrives.",
      );
    } catch (error) {
      if (!mounted.current) return;
      setPhase("error");
      setMessage(error instanceof BillingApiError ? error.message : "Could not check your payment.");
    } finally {
      busy.current = false;
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setPhase("starting");
    setMessage(null);
    try {
      const checkout = await startCheckout(product);
      if (checkout.status === "already_owned") {
        await refreshBilling();
        if (mounted.current) setPhase("success");
        return;
      }
      reference.current = checkout.reference;
      await Linking.openURL(checkout.authorizationUrl);
      if (mounted.current) setPhase("awaiting");
    } catch (error) {
      if (!mounted.current) return;
      setPhase("error");
      setMessage(
        error instanceof BillingApiError ? error.message : "Could not open checkout. Please try again.",
      );
    } finally {
      busy.current = false;
    }
  }, [product]);

  /** Resume an interrupted checkout (app killed or returned via the callback link). */
  const resume = useCallback(
    async (knownReference?: string): Promise<void> => {
      reference.current = knownReference ?? reference.current;
      if (!reference.current) {
        await refreshBilling();
        return;
      }
      await verify();
    },
    [verify],
  );

  // Coming back from the provider's checkout: ask the backend what really happened.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && phaseRef.current === "awaiting") void verify();
    });
    return () => subscription.remove();
  }, [verify]);

  const reset = useCallback(() => {
    setPhase("idle");
    setMessage(null);
  }, []);

  return { phase, message, start, verify, resume, reset };
}
