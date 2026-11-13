import { getPdfProcessorBaseUrl } from "../constants/config";
import {
  LeakIntelligenceApiError,
  parseLeakDetectionResult,
} from "../features/leak-intelligence/leak-intelligence.parse";
import type { LeakDetectionResult } from "../features/leak-intelligence/leak-intelligence.types";
import {
  parseStatementReview,
  type StatementReview,
} from "../features/leak-intelligence/statement-review.parse";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export { LeakIntelligenceApiError };

// Analysis reads every statement across all accounts, so allow it more time.
const REQUEST_TIMEOUT_MS = 45_000;

export async function fetchLeakDetections(
  signal?: AbortSignal,
  /** Skip the server's saved result and analyse again. */
  refresh = false,
): Promise<LeakDetectionResult> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) {
    throw new LeakIntelligenceApiError(
      "Leak Intelligence is not configured. Set EXPO_PUBLIC_PDF_PROCESSOR_URL.",
    );
  }

  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await fetch(`${baseUrl}/leak-detections${refresh ? "?refresh=true" : ""}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new LeakIntelligenceApiError(
        safeErrorMessage(payload, response.status),
        response.status,
      );
    }
    return parseLeakDetectionResult(payload);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new LeakIntelligenceApiError(
        "Leak Intelligence timed out. Please try again.",
      );
    }
    if (error instanceof LeakIntelligenceApiError) {
      throw error;
    }
    throw new LeakIntelligenceApiError(
      "Could not analyse your financial activity. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

/** The whole statement report as plain text, for sharing. */
export async function fetchStatementReport(signal?: AbortSignal): Promise<string> {
  return (await fetchStatementReview(signal)).report;
}

/**
 * The statement report built by the server: findings in their groups, what each one shows
 * and cannot show, commitments, questions and coverage limits, as text, plus the parts a
 * screen shows on its own (good news).
 */
export async function fetchStatementReview(signal?: AbortSignal): Promise<StatementReview> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) {
    throw new LeakIntelligenceApiError(
      "The statement report is not configured. Set EXPO_PUBLIC_PDF_PROCESSOR_URL.",
    );
  }
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetch(`${baseUrl}/statement-review`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new LeakIntelligenceApiError(safeErrorMessage(payload, response.status), response.status);
    }
    const review = parseStatementReview(payload);
    if (!review) {
      throw new LeakIntelligenceApiError("The statement report came back empty.");
    }
    return review;
  } catch (error) {
    if (error instanceof LeakIntelligenceApiError) throw error;
    if (controller.signal.aborted && !signal?.aborted) {
      throw new LeakIntelligenceApiError("The statement report timed out. Please try again.");
    }
    throw new LeakIntelligenceApiError("Could not build the statement report. Please try again.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new LeakIntelligenceApiError("Supabase is not configured.");
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new LeakIntelligenceApiError(
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
  const message = detail && detail.length <= 180 ? detail : "Could not load Leak Intelligence.";
  return `Request failed (${status}): ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
