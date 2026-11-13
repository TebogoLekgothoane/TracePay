import { getSupabase } from "@/lib/supabase";

const BASE_URL = (process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || "http://127.0.0.1:8001")
  .replace(/\/$/, "")
  .replace(/\/v\d+$/, "");
const REQUEST_TIMEOUT_MS = 20_000;

export class BackendRequestError extends Error {}

async function backendRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();

  if (!session?.access_token) {
    throw new BackendRequestError("Sign in again to continue.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/v1${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers,
      },
    });
  } catch (error) {
    throw new BackendRequestError(
      error instanceof Error && error.name === "AbortError"
        ? "TracePay took too long to respond. Please try again."
        : "Can't reach TracePay's servers right now. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new BackendRequestError(
      body?.error?.message || body?.detail || `Request failed (${response.status}).`,
    );
  }

  return (await response.json()) as T;
}

export function redeemPartnerOffer(partnerId: string): Promise<{ remaining_points: number }> {
  return backendRequest("/me/redeem", {
    method: "POST",
    body: JSON.stringify({ partner_id: partnerId }),
  });
}

export interface LifecycleTransaction {
  client_id: string;
  timestamp: string;
  amount: number;
  currency: string;
  description: string;
  merchant?: string;
  category?: string;
  counterparty?: string;
  direction: "debit" | "credit" | "reversal";
  channel: "sms" | "demo" | "bank" | "momo";
  meta: Record<string, unknown>;
}

export interface LifecycleLeak {
  id: string;
  fi_code: string;
  status: "active" | "monitoring" | "resolved";
  detected_at: string;
  resolved_at: string | null;
  detection_rule: string;
  resolution_rule: string;
  resolution_checked_at: string | null;
  evidence: Record<string, unknown>;
  resolution_evidence: Record<string, unknown> | null;
  merchant: string | null;
  amount_monthly: number;
  amount_annual: number;
  exact_action: string;
}

export interface TransactionSyncResponse {
  accepted_count: number;
  inserted_count: number;
  leaks: LifecycleLeak[];
}

export function syncTransactions(
  transactions: LifecycleTransaction[],
  signal?: AbortSignal,
): Promise<TransactionSyncResponse> {
  return backendRequest("/transactions/sync", {
    method: "POST",
    body: JSON.stringify({ transactions }),
    signal,
  });
}
