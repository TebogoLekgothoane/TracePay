import { getPdfProcessorBaseUrl } from "../constants/config";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import type {
  AnalysisStatus,
  Avoidability,
  FinancialReasoning,
  FinancialReasoningResult,
  ImpactAssessment,
  Persistence,
  RootCauseType,
} from "../features/financial-reasoning/financial-reasoning.types";
import type { LeakImpactKind } from "../features/leak-intelligence/leak-intelligence.types";

const REQUEST_TIMEOUT_MS = 15_000;

const ROOT_CAUSE_TYPES = new Set<RootCauseType>([
  "frequency_increase",
  "amount_increase",
  "price_increase",
  "recurring_commitment",
  "fee_accumulation",
  "potential_duplicate",
  "behavioural_concentration",
  "merchant_concentration",
  "category_growth",
  "transaction_pattern",
  "insufficient_evidence",
  "unknown",
]);

export class FinancialReasoningApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FinancialReasoningApiError";
  }
}

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

export function parseFinancialReasoningResult(
  payload: unknown,
): FinancialReasoningResult {
  if (!isRecord(payload) || !Array.isArray(payload.analyses)) {
    throw new FinancialReasoningApiError(
      "Financial Reasoning returned an invalid response.",
    );
  }
  if (
    typeof payload.user_id !== "string" ||
    !isFiniteNumber(payload.transaction_count) ||
    typeof payload.reasoning_version !== "string" ||
    !isFiniteNumber(payload.potential_leaks_analyzed)
  ) {
    throw new FinancialReasoningApiError(
      "Financial Reasoning returned an invalid response.",
    );
  }
  return {
    user_id: payload.user_id,
    transaction_count: payload.transaction_count,
    period_start: optionalDate(payload.period_start),
    period_end: optionalDate(payload.period_end),
    reasoning_version: payload.reasoning_version,
    potential_leaks_analyzed: payload.potential_leaks_analyzed,
    analyses: payload.analyses.map(parseFinancialReasoning),
  };
}

function parseFinancialReasoning(value: unknown): FinancialReasoning {
  if (!isRecord(value)) {
    throw new FinancialReasoningApiError(
      "Financial Reasoning returned an invalid analysis.",
    );
  }
  const requiredText = [
    "reasoning_id",
    "leak_id",
    "root_cause_type",
    "title",
    "explanation",
  ] as const;
  if (requiredText.some((key) => typeof value[key] !== "string")) {
    throw new FinancialReasoningApiError(
      "Financial Reasoning returned an invalid analysis.",
    );
  }
  if (
    !isRootCauseType(value.root_cause_type) ||
    !isAvoidability(value.avoidability) ||
    !isPersistence(value.persistence) ||
    !isAnalysisStatus(value.analysis_status) ||
    !isFiniteNumber(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !isRecord(value.evidence) ||
    !isStringArray(value.supporting_behavior_ids) ||
    !isStringArray(value.supporting_feature_references) ||
    !Array.isArray(value.competing_explanations) ||
    !value.competing_explanations.every(isRootCauseType)
  ) {
    throw new FinancialReasoningApiError(
      "Financial Reasoning returned an invalid analysis.",
    );
  }
  const text = value as Record<(typeof requiredText)[number], string>;
  return {
    reasoning_id: text.reasoning_id,
    leak_id: text.leak_id,
    root_cause_type: value.root_cause_type,
    title: text.title,
    explanation: text.explanation,
    confidence: value.confidence,
    evidence: value.evidence,
    supporting_behavior_ids: value.supporting_behavior_ids,
    supporting_feature_references: value.supporting_feature_references,
    impact_assessment: parseImpactAssessment(value.impact_assessment),
    avoidability: value.avoidability,
    persistence: value.persistence,
    analysis_status: value.analysis_status,
    competing_explanations: value.competing_explanations,
  };
}

function parseImpactAssessment(value: unknown): ImpactAssessment {
  if (!isRecord(value)) {
    throw new FinancialReasoningApiError(
      "Financial Reasoning returned an invalid impact assessment.",
    );
  }
  if (
    !isImpactKind(value.impact_kind) ||
    !isMoney(value.detected_amount) ||
    (value.detected_annual_amount !== null &&
      !isMoney(value.detected_annual_amount)) ||
    (value.potentially_avoidable_amount !== null &&
      !isMoney(value.potentially_avoidable_amount)) ||
    (value.potentially_avoidable_annual_amount !== null &&
      !isMoney(value.potentially_avoidable_annual_amount)) ||
    (value.recoverable_amount !== null && !isMoney(value.recoverable_amount)) ||
    (value.avoidability_confidence !== null &&
      (!isFiniteNumber(value.avoidability_confidence) ||
        value.avoidability_confidence < 0 ||
        value.avoidability_confidence > 1)) ||
    value.currency !== "ZAR"
  ) {
    throw new FinancialReasoningApiError(
      "Financial Reasoning returned an invalid impact assessment.",
    );
  }
  return {
    detected_amount: value.detected_amount,
    detected_annual_amount: value.detected_annual_amount,
    impact_kind: value.impact_kind,
    potentially_avoidable_amount: value.potentially_avoidable_amount,
    potentially_avoidable_annual_amount:
      value.potentially_avoidable_annual_amount,
    recoverable_amount: value.recoverable_amount,
    avoidability_confidence: value.avoidability_confidence,
    currency: "ZAR",
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
    (typeof value === "string" &&
      value.trim().length > 0 &&
      Number.isFinite(Number(value)))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isImpactKind(value: unknown): value is LeakImpactKind {
  return value === "recurring" || value === "one_time" || value === "estimated";
}

function isRootCauseType(value: unknown): value is RootCauseType {
  return typeof value === "string" && ROOT_CAUSE_TYPES.has(value as RootCauseType);
}

function isAvoidability(value: unknown): value is Avoidability {
  return (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "unknown"
  );
}

function isPersistence(value: unknown): value is Persistence {
  return (
    value === "new" ||
    value === "temporary" ||
    value === "persistent" ||
    value === "increasing" ||
    value === "declining" ||
    value === "insufficient_history"
  );
}

function isAnalysisStatus(value: unknown): value is AnalysisStatus {
  return (
    value === "supported" ||
    value === "competing_explanations" ||
    value === "insufficient_evidence" ||
    value === "verification_required"
  );
}
