import { getPdfProcessorBaseUrl } from "../constants/config";
import {
  FinancialReasoningApiError,
  parseFinancialReasoningResult,
} from "../features/financial-reasoning/financial-reasoning.parse";
import type { FinancialReasoningResult } from "../features/financial-reasoning/financial-reasoning.types";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export { FinancialReasoningApiError };

const REQUEST_TIMEOUT_MS = 15_000;

export async function fetchFinancialReasoning(
  signal?: AbortSignal,
): Promise<FinancialReasoningResult> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) {
    throw new FinancialReasoningApiError(
      "Financial Reasoning is not configured. Set EXPO_PUBLIC_PDF_PROCESSOR_URL.",
    );
  }

  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await fetch(`${baseUrl}/financial-reasoning`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new FinancialReasoningApiError(
        safeErrorMessage(payload, response.status),
        response.status,
      );
    }
    return parseFinancialReasoningResult(payload);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new FinancialReasoningApiError(
        "Financial Reasoning timed out. Please try again.",
      );
    }
    if (error instanceof FinancialReasoningApiError) {
      throw error;
    }
    throw new FinancialReasoningApiError(
      "Could not load financial reasoning. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new FinancialReasoningApiError("Supabase is not configured.");
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new FinancialReasoningApiError(
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
      : "Could not load Financial Reasoning.";
  return `Request failed (${status}): ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
