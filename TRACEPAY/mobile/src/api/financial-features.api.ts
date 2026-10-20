import { getPdfProcessorBaseUrl } from "../constants/config";
import {
  parseFinancialFeaturesSubscriptions,
  SubscriptionsDebugApiError,
} from "../features/subscriptions-debug/subscriptions.parse";
import type { SubscriptionsDebugResult } from "../features/subscriptions-debug/subscriptions.types";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export { SubscriptionsDebugApiError };

const REQUEST_TIMEOUT_MS = 15_000;

export async function fetchDetectedSubscriptions(
  signal?: AbortSignal,
): Promise<SubscriptionsDebugResult> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) {
    throw new SubscriptionsDebugApiError(
      "Subscriptions debug is not configured. Set EXPO_PUBLIC_PDF_PROCESSOR_URL.",
    );
  }

  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await fetch(`${baseUrl}/financial-features`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new SubscriptionsDebugApiError(
        safeErrorMessage(payload, response.status),
        response.status,
      );
    }
    return parseFinancialFeaturesSubscriptions(payload);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new SubscriptionsDebugApiError(
        "Subscriptions analysis timed out. Please try again.",
      );
    }
    if (error instanceof SubscriptionsDebugApiError) {
      throw error;
    }
    throw new SubscriptionsDebugApiError(
      "Could not load subscriptions from your statements. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new SubscriptionsDebugApiError("Supabase is not configured.");
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new SubscriptionsDebugApiError(
      "Your session has expired. Please sign in again.",
    );
  }
  return data.session.access_token;
}

function safeErrorMessage(payload: unknown, status: number): string {
  const detail =
    isRecord(payload) && typeof payload.detail === "string"
      ? payload.detail.trim()
      : "";
  const message =
    detail && detail.length <= 180
      ? detail
      : "Could not load financial features.";
  return `Request failed (${status}): ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
