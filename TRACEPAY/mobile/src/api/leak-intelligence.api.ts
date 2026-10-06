import { getPdfProcessorBaseUrl } from "../constants/config";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import type {
  LeakDetection,
  LeakDetectionResult,
  LeakImpactKind,
  LeakSeverity,
  LeakStatus,
} from "../features/leak-intelligence/leak-intelligence.types";

const REQUEST_TIMEOUT_MS = 15_000;

export class LeakIntelligenceApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LeakIntelligenceApiError";
  }
}

export async function fetchLeakDetections(
  signal?: AbortSignal,
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
    const response = await fetch(`${baseUrl}/leak-detections`, {
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

export function parseLeakDetectionResult(payload: unknown): LeakDetectionResult {
  if (!isRecord(payload) || !Array.isArray(payload.leaks)) {
    throw new LeakIntelligenceApiError(
      "Leak Intelligence returned an invalid response.",
    );
  }
  if (
    typeof payload.user_id !== "string" ||
    !isFiniteNumber(payload.transaction_count) ||
    typeof payload.detector_version !== "string"
  ) {
    throw new LeakIntelligenceApiError(
      "Leak Intelligence returned an invalid response.",
    );
  }
  const leaks = payload.leaks.map(parseLeakDetection);
  return {
    user_id: payload.user_id,
    transaction_count: payload.transaction_count,
    period_start: optionalDate(payload.period_start),
    period_end: optionalDate(payload.period_end),
    detector_version: payload.detector_version,
    leaks,
  };
}

function parseLeakDetection(value: unknown): LeakDetection {
  if (!isRecord(value)) {
    throw new LeakIntelligenceApiError("Leak Intelligence returned an invalid leak.");
  }
  const requiredText = [
    "leak_id",
    "fingerprint",
    "leak_type",
    "title",
    "description",
    "detector_version",
    "detected_at",
  ] as const;
  if (requiredText.some((key) => typeof value[key] !== "string")) {
    throw new LeakIntelligenceApiError("Leak Intelligence returned an invalid leak.");
  }
  if (
    !isSeverity(value.severity) ||
    !isStatus(value.status) ||
    !isImpactKind(value.impact_kind) ||
    !isFiniteNumber(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !isMoney(value.estimated_monthly_impact) ||
    (value.estimated_annual_impact !== null &&
      !isMoney(value.estimated_annual_impact)) ||
    !isRecord(value.evidence) ||
    !isStringArray(value.supporting_behavior_ids) ||
    !isStringArray(value.supporting_feature_references)
  ) {
    throw new LeakIntelligenceApiError("Leak Intelligence returned an invalid leak.");
  }
  const text = value as Record<(typeof requiredText)[number], string>;
  return {
    leak_id: text.leak_id,
    fingerprint: text.fingerprint,
    leak_type: text.leak_type,
    title: text.title,
    description: text.description,
    severity: value.severity,
    confidence: value.confidence,
    status: value.status,
    estimated_monthly_impact: value.estimated_monthly_impact,
    estimated_annual_impact: value.estimated_annual_impact,
    impact_kind: value.impact_kind,
    evidence: value.evidence,
    supporting_behavior_ids: value.supporting_behavior_ids,
    supporting_feature_references: value.supporting_feature_references,
    detector_version: text.detector_version,
    detected_at: text.detected_at,
    period_start: optionalDate(value.period_start),
    period_end: optionalDate(value.period_end),
  };
}

function optionalDate(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMoney(value: unknown): value is number | string {
  return (
    isFiniteNumber(value) ||
    (typeof value === "string" && value.trim().length > 0 && Number.isFinite(Number(value)))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSeverity(value: unknown): value is LeakSeverity {
  return value === "low" || value === "medium" || value === "high";
}

function isStatus(value: unknown): value is LeakStatus {
  return (
    value === "active" ||
    value === "monitoring" ||
    value === "resolved" ||
    value === "dismissed"
  );
}

function isImpactKind(value: unknown): value is LeakImpactKind {
  return value === "recurring" || value === "one_time" || value === "estimated";
}
