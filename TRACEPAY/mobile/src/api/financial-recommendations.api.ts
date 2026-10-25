import { getPdfProcessorBaseUrl } from "../constants/config";
import {
  FinancialRecommendationsApiError,
  parseFinancialRecommendationResult,
} from "../features/financial-recommendations/financial-recommendations.parse";
import type { FinancialRecommendationResult } from "../features/financial-recommendations/financial-recommendations.types";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export { FinancialRecommendationsApiError };

const REQUEST_TIMEOUT_MS = 45_000;

export async function fetchFinancialRecommendations(
  signal?: AbortSignal,
): Promise<FinancialRecommendationResult> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) {
    throw new FinancialRecommendationsApiError(
      "Recommendations are not configured. Set EXPO_PUBLIC_PDF_PROCESSOR_URL.",
    );
  }

  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await fetch(`${baseUrl}/financial-recommendations`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new FinancialRecommendationsApiError(
        safeErrorMessage(payload, response.status),
        response.status,
      );
    }
    return parseFinancialRecommendationResult(payload);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new FinancialRecommendationsApiError(
        "Recommendations timed out. Please try again.",
      );
    }
    if (error instanceof FinancialRecommendationsApiError) {
      throw error;
    }
    throw new FinancialRecommendationsApiError(
      "Could not load recommendations. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new FinancialRecommendationsApiError("Supabase is not configured.");
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new FinancialRecommendationsApiError(
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
      : "Could not load recommendations.";
  return `Request failed (${status}): ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
