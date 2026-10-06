import { getPdfProcessorBaseUrl } from "../constants/config";
import type { RootCauseType } from "../features/financial-reasoning/financial-reasoning.types";
import type {
  FinancialRecommendationResult,
  FindingScope,
  ImpactLabel,
  Recommendation,
  RecommendationMetadata,
  RecommendationPriority,
  RecommendationType,
} from "../features/financial-recommendations/financial-recommendations.types";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

const REQUEST_TIMEOUT_MS = 15_000;

const RECOMMENDATION_TYPES = new Set<RecommendationType>([
  "review_bank_fees",
  "review_recurring_payment",
  "review_high_frequency_spending",
  "review_airtime_data_usage",
  "verify_potential_duplicate",
  "monitor_spending_pattern",
]);

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

export class FinancialRecommendationsApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FinancialRecommendationsApiError";
  }
}

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

export function parseFinancialRecommendationResult(
  payload: unknown,
): FinancialRecommendationResult {
  if (!isRecord(payload) || !Array.isArray(payload.recommendations)) {
    throw new FinancialRecommendationsApiError(
      "Recommendations returned an invalid response.",
    );
  }
  if (
    typeof payload.user_id !== "string" ||
    !isOptionalDate(payload.period_start) ||
    !isOptionalDate(payload.period_end) ||
    typeof payload.reasoning_version !== "string" ||
    typeof payload.recommendation_version !== "string" ||
    !isFiniteNumber(payload.recommendation_count) ||
    payload.recommendation_count < 0
  ) {
    throw new FinancialRecommendationsApiError(
      "Recommendations returned an invalid response.",
    );
  }
  return {
    user_id: payload.user_id,
    period_start: optionalDate(payload.period_start),
    period_end: optionalDate(payload.period_end),
    reasoning_version: payload.reasoning_version,
    recommendation_version: payload.recommendation_version,
    recommendation_count: payload.recommendation_count,
    recommendations: payload.recommendations.map(parseRecommendation),
    metadata: parseMetadata(payload.metadata),
  };
}

function parseRecommendation(value: unknown): Recommendation {
  if (!isRecord(value)) {
    throw new FinancialRecommendationsApiError(
      "Recommendations returned an invalid recommendation.",
    );
  }
  if (
    typeof value.recommendation_id !== "string" ||
    !isRecommendationType(value.recommendation_type) ||
    typeof value.title !== "string" ||
    typeof value.explanation !== "string" ||
    typeof value.recommended_action !== "string" ||
    !isPriority(value.priority) ||
    !isUnitInterval(value.recommendation_confidence) ||
    typeof value.source_reasoning_id !== "string" ||
    !isRootCauseType(value.source_root_cause_type) ||
    !isStringArray(value.evidence_references) ||
    !isFindingScope(value.finding_scope) ||
    !isImpactLabel(value.impact_label) ||
    !isOptionalMoney(value.potential_recovery_amount) ||
    !isOptionalMoney(value.supported_impact_amount) ||
    !isOptionalMoney(value.expected_savings_amount) ||
    value.currency !== "ZAR"
  ) {
    throw new FinancialRecommendationsApiError(
      "Recommendations returned an invalid recommendation.",
    );
  }
  return {
    recommendation_id: value.recommendation_id,
    recommendation_type: value.recommendation_type,
    title: value.title,
    explanation: value.explanation,
    recommended_action: value.recommended_action,
    priority: value.priority,
    recommendation_confidence: value.recommendation_confidence,
    source_reasoning_id: value.source_reasoning_id,
    source_root_cause_type: value.source_root_cause_type,
    evidence_references: value.evidence_references,
    finding_scope: value.finding_scope,
    impact_label: value.impact_label,
    potential_recovery_amount: value.potential_recovery_amount,
    supported_impact_amount: value.supported_impact_amount,
    expected_savings_amount: value.expected_savings_amount,
    currency: "ZAR",
  };
}

function parseMetadata(value: unknown): RecommendationMetadata {
  if (
    !isRecord(value) ||
    value.automated_actions !== "none" ||
    value.savings_policy !== "only_when_directly_supported" ||
    value.amounts_are_additive !== false ||
    (value.overlap_note !== null && typeof value.overlap_note !== "string")
  ) {
    throw new FinancialRecommendationsApiError(
      "Recommendations returned invalid report metadata.",
    );
  }
  return {
    automated_actions: "none",
    savings_policy: "only_when_directly_supported",
    amounts_are_additive: false,
    overlap_note: value.overlap_note,
  };
}

function optionalDate(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isOptionalDate(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isUnitInterval(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isOptionalMoney(value: unknown): value is number | string | null {
  return (
    value === null ||
    isFiniteNumber(value) ||
    (typeof value === "string" &&
      value.trim().length > 0 &&
      Number.isFinite(Number(value)))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecommendationType(value: unknown): value is RecommendationType {
  return (
    typeof value === "string" &&
    RECOMMENDATION_TYPES.has(value as RecommendationType)
  );
}

function isRootCauseType(value: unknown): value is RootCauseType {
  return typeof value === "string" && ROOT_CAUSE_TYPES.has(value as RootCauseType);
}

function isPriority(value: unknown): value is RecommendationPriority {
  return value === "high" || value === "medium" || value === "low";
}

function isFindingScope(value: unknown): value is FindingScope {
  return (
    value === "overall_pattern" ||
    value === "contributing_category" ||
    value === "one_time_recovery_candidate" ||
    value === "standalone"
  );
}

function isImpactLabel(value: unknown): value is ImpactLabel | null {
  return (
    value === null ||
    value === "detected_increase" ||
    value === "observed_fee_activity" ||
    value === "observed_recurring_payment" ||
    value === "potential_recovery_candidate"
  );
}
