import { getPdfProcessorBaseUrl } from "../constants/config";
import {
  parseSyntheticScenarioAnalysis,
  parseSyntheticScenarioCatalog,
  SyntheticIntelligenceParseError,
} from "../features/synthetic-intelligence/synthetic-intelligence.parse";
import type {
  SyntheticScenarioAnalysis,
  SyntheticScenarioCatalog,
} from "../features/synthetic-intelligence/synthetic-intelligence.types";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

const REQUEST_TIMEOUT_MS = 15_000;

export class SyntheticIntelligenceApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SyntheticIntelligenceApiError";
  }
}

export async function fetchSyntheticScenarios(
  signal?: AbortSignal,
): Promise<SyntheticScenarioCatalog> {
  return request("/debug/intelligence-scenarios", signal, parseSyntheticScenarioCatalog);
}

export async function fetchSyntheticScenarioAnalysis(
  scenarioId: string,
  signal?: AbortSignal,
): Promise<SyntheticScenarioAnalysis> {
  return request(
    `/debug/intelligence-scenarios/${encodeURIComponent(scenarioId)}/analysis`,
    signal,
    parseSyntheticScenarioAnalysis,
  );
}

async function request<T>(
  path: string,
  signal: AbortSignal | undefined,
  parse: (payload: unknown) => T,
): Promise<T> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) {
    throw new SyntheticIntelligenceApiError(
      "Synthetic testing is not configured. Set EXPO_PUBLIC_PDF_PROCESSOR_URL.",
    );
  }
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new SyntheticIntelligenceApiError(
        safeErrorMessage(payload, response.status),
        response.status,
      );
    }
    return parse(payload);
  } catch (error) {
    if (error instanceof SyntheticIntelligenceApiError) {
      throw error;
    }
    if (error instanceof SyntheticIntelligenceParseError) {
      throw new SyntheticIntelligenceApiError(error.message);
    }
    if (controller.signal.aborted && !signal?.aborted) {
      throw new SyntheticIntelligenceApiError(
        "Synthetic analysis timed out. Please try again.",
      );
    }
    throw new SyntheticIntelligenceApiError(
      "Could not run the synthetic scenario. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new SyntheticIntelligenceApiError("Supabase is not configured.");
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new SyntheticIntelligenceApiError(
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
  if (status === 404) {
    return "Synthetic testing is unavailable in this environment.";
  }
  const message =
    detail && detail.length <= 180 ? detail : "Could not load synthetic scenarios.";
  return `Request failed (${status}): ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
