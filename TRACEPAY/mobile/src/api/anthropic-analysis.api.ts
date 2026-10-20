import { getPdfProcessorBaseUrl } from "../constants/config";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export type AnthropicLeak = {
  type: string;
  title: string;
  merchant: string;
  reason: string;
  confidence: number;
  monthly_impact: string | null;
  annual_impact: string | null;
  observed_amount: string | null;
  transaction_ids: string[];
  evidence_transactions: AnthropicEvidenceTransaction[];
  steps_to_stop: string[];
};

export type AnthropicEvidenceTransaction = {
  transaction_id: string;
  date: string | null;
  amount: string | null;
  description: string;
};

export type AnthropicSubscription = {
  merchant: string;
  product: string;
  classification: string;
  cadence: string;
  current_amount: string | null;
  estimated_monthly_cost: string | null;
  estimated_annual_cost: string | null;
  observed_amount: string | null;
  confidence: number;
  successful_transaction_ids: string[];
  failed_transaction_ids: string[];
  evidence_transactions: AnthropicEvidenceTransaction[];
  steps_to_stop: string[];
  reason: string;
};

export type AnthropicAnalysis = {
  available: boolean;
  provider: "anthropic";
  leaks: AnthropicLeak[];
  subscriptions: AnthropicSubscription[];
  notes: string[];
};

export async function fetchAnthropicAnalysis(signal?: AbortSignal): Promise<AnthropicAnalysis> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl || !isSupabaseConfigured()) {
    throw new Error("Anthropic analysis is not configured.");
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  const response = await fetch(`${baseUrl}/anthropic-financial-analysis`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${data.session.access_token}` },
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = isRecord(payload) && typeof payload.detail === "string" ? payload.detail : "Anthropic analysis failed.";
    throw new Error(detail);
  }
  return parseAnthropicAnalysis(payload);
}

function parseAnthropicAnalysis(value: unknown): AnthropicAnalysis {
  if (!isRecord(value)) throw new Error("Anthropic analysis returned an invalid response.");
  return {
    available: value.available === true,
    provider: "anthropic",
    leaks: Array.isArray(value.leaks) ? value.leaks.map(parseLeak).filter((item): item is AnthropicLeak => item !== null) : [],
    subscriptions: Array.isArray(value.subscriptions) ? value.subscriptions.map(parseSubscription).filter((item): item is AnthropicSubscription => item !== null) : [],
    notes: Array.isArray(value.notes) ? value.notes.filter((item): item is string => typeof item === "string") : [],
  };
}

function parseLeak(value: unknown): AnthropicLeak | null {
  if (!isRecord(value) || typeof value.title !== "string" || typeof value.reason !== "string") return null;
  return {
    type: typeof value.type === "string" ? value.type : "unknown",
    title: value.title,
    merchant: typeof value.merchant === "string" ? value.merchant : "",
    reason: value.reason,
    confidence: finiteNumber(value.confidence),
    monthly_impact: stringOrNull(value.monthly_impact),
    annual_impact: stringOrNull(value.annual_impact),
    observed_amount: stringOrNull(value.observed_amount),
    transaction_ids: stringArray(value.transaction_ids),
    evidence_transactions: evidenceArray(value.evidence_transactions),
    steps_to_stop: stringArray(value.steps_to_stop),
  };
}

function parseSubscription(value: unknown): AnthropicSubscription | null {
  if (!isRecord(value) || typeof value.merchant !== "string" || typeof value.reason !== "string") return null;
  return {
    merchant: value.merchant,
    product: typeof value.product === "string" ? value.product : "",
    classification: typeof value.classification === "string" ? value.classification : "uncertain",
    cadence: typeof value.cadence === "string" ? value.cadence : "uncertain",
    current_amount: stringOrNull(value.current_amount),
    estimated_monthly_cost: stringOrNull(value.estimated_monthly_cost),
    estimated_annual_cost: stringOrNull(value.estimated_annual_cost),
    observed_amount: stringOrNull(value.observed_amount),
    confidence: finiteNumber(value.confidence),
    successful_transaction_ids: stringArray(value.successful_transaction_ids),
    failed_transaction_ids: stringArray(value.failed_transaction_ids),
    evidence_transactions: evidenceArray(value.evidence_transactions),
    steps_to_stop: stringArray(value.steps_to_stop),
    reason: value.reason,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function evidenceArray(value: unknown): AnthropicEvidenceTransaction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    transaction_id: typeof item.transaction_id === "string" ? item.transaction_id : "unknown",
    date: stringOrNull(item.date),
    amount: stringOrNull(item.amount),
    description: typeof item.description === "string" ? item.description : "",
  }));
}

function finiteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
