import type { LeakImpactKind } from "../leak-intelligence/leak-intelligence.types";

export type RootCauseType =
  | "frequency_increase"
  | "amount_increase"
  | "price_increase"
  | "recurring_commitment"
  | "fee_accumulation"
  | "potential_duplicate"
  | "behavioural_concentration"
  | "merchant_concentration"
  | "category_growth"
  | "transaction_pattern"
  | "insufficient_evidence"
  | "unknown";

export type Avoidability = "high" | "medium" | "low" | "unknown";

export type Persistence =
  | "new"
  | "temporary"
  | "persistent"
  | "increasing"
  | "declining"
  | "insufficient_history";

export type AnalysisStatus =
  | "supported"
  | "competing_explanations"
  | "insufficient_evidence"
  | "verification_required";

export type ImpactAssessment = {
  detected_amount: number | string;
  detected_annual_amount: number | string | null;
  impact_kind: LeakImpactKind;
  potentially_avoidable_amount: number | string | null;
  potentially_avoidable_annual_amount: number | string | null;
  recoverable_amount: number | string | null;
  avoidability_confidence: number | null;
  currency: "ZAR";
};

export type FinancialReasoning = {
  reasoning_id: string;
  leak_id: string;
  root_cause_type: RootCauseType;
  title: string;
  explanation: string;
  confidence: number;
  evidence: Record<string, unknown>;
  supporting_behavior_ids: string[];
  supporting_feature_references: string[];
  impact_assessment: ImpactAssessment;
  avoidability: Avoidability;
  persistence: Persistence;
  analysis_status: AnalysisStatus;
  competing_explanations: RootCauseType[];
};

export type FinancialReasoningResult = {
  user_id: string;
  transaction_count: number;
  period_start: string | null;
  period_end: string | null;
  reasoning_version: string;
  potential_leaks_analyzed: number;
  analyses: FinancialReasoning[];
};
