import type { RootCauseType } from "../financial-reasoning/financial-reasoning.types";

export type RecommendationType =
  | "review_bank_fees"
  | "review_recurring_payment"
  | "review_high_frequency_spending"
  | "review_airtime_data_usage"
  | "verify_potential_duplicate"
  | "monitor_spending_pattern";

export type RecommendationPriority = "high" | "medium" | "low";

export type FindingScope =
  | "overall_pattern"
  | "contributing_category"
  | "one_time_recovery_candidate"
  | "standalone";

export type ImpactLabel =
  | "detected_increase"
  | "observed_fee_activity"
  | "observed_recurring_payment"
  | "potential_recovery_candidate";

export type MoneyValue = number | string;

export type Recommendation = {
  recommendation_id: string;
  recommendation_type: RecommendationType;
  title: string;
  explanation: string;
  recommended_action: string;
  priority: RecommendationPriority;
  recommendation_confidence: number;
  source_reasoning_id: string;
  source_root_cause_type: RootCauseType;
  evidence_references: string[];
  finding_scope: FindingScope;
  impact_label: ImpactLabel | null;
  potential_recovery_amount: MoneyValue | null;
  supported_impact_amount: MoneyValue | null;
  expected_savings_amount: MoneyValue | null;
  currency: "ZAR";
};

export type RecommendationMetadata = {
  automated_actions: "none";
  savings_policy: "only_when_directly_supported";
  amounts_are_additive: false;
  overlap_note: string | null;
};

export type FinancialRecommendationResult = {
  user_id: string;
  period_start: string | null;
  period_end: string | null;
  reasoning_version: string;
  recommendation_version: string;
  recommendation_count: number;
  recommendations: Recommendation[];
  metadata: RecommendationMetadata;
};
