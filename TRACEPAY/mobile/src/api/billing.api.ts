import { getPdfProcessorBaseUrl } from "../constants/config";
import {
  parseCheckout,
  parseEntitlements,
  parseProducts,
  parseVerify,
} from "../features/billing/billing.parse";
import type {
  BillingEntitlements,
  BillingProduct,
  BillingProducts,
  CheckoutResult,
  VerifyResult,
} from "../features/billing/billing.types";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export class BillingApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BillingApiError";
  }
}

const TIMEOUT_MS = 20_000;

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) throw new BillingApiError("Supabase is not configured.");
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new BillingApiError("Sign in again to continue.", 401);
  }
  return data.session.access_token;
}

async function call(path: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) throw new BillingApiError("Payments are not configured.");
  const token = await accessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        payload &&
        typeof payload === "object" &&
        typeof (payload as { detail?: unknown }).detail === "string"
          ? (payload as { detail: string }).detail
          : "Payments are temporarily unavailable.";
      throw new BillingApiError(detail, response.status);
    }
    return payload;
  } catch (error) {
    if (error instanceof BillingApiError) throw error;
    if (controller.signal.aborted) {
      throw new BillingApiError("That took too long. Please try again.");
    }
    throw new BillingApiError("Could not reach TracePay. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBillingProducts(): Promise<BillingProducts> {
  return parseProducts(await call("/billing/products"));
}

export async function fetchEntitlements(): Promise<BillingEntitlements> {
  return parseEntitlements(await call("/billing/entitlements"));
}

export async function startCheckout(product: BillingProduct): Promise<CheckoutResult> {
  return parseCheckout(await call("/billing/checkout", { method: "POST", body: { product } }));
}

export async function verifyPayment(reference: string): Promise<VerifyResult> {
  return parseVerify(await call("/billing/verify", { method: "POST", body: { reference } }));
}

export async function cancelMonitoring(): Promise<BillingEntitlements> {
  return parseEntitlements(await call("/billing/monitoring/cancel", { method: "POST" }));
}
