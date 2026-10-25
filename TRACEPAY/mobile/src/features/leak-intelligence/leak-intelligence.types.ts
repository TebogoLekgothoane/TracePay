export type LeakImpactKind = "recurring" | "one_time" | "estimated";
export type LeakSeverity = "low" | "medium" | "high";
export type LeakStatus = "active" | "monitoring" | "resolved" | "dismissed";

export type SupportingTransactionRole =
  | "payment"
  | "fee"
  | "other_fee"
  | "failed_attempt_fee"
  | "reversal";

export type SupportingTransaction = {
  transaction_id: string;
  date: string;
  description: string;
  amount: number | string;
  direction: string;
  role: SupportingTransactionRole;
};

export type LeakAccountPattern =
  | "single_account"
  | "consolidated_across_accounts"
  | "sequential_move"
  | "concurrent_charges"
  | "unrelated_accounts";

export type LeakAmountStatus = "confirmed" | "estimated" | "potentially_duplicated";

export type LeakConfidenceLevel = "high" | "medium" | "low";

export type LeakAnalysisSourceAccount = {
  account_id: string;
  label: string;
  transaction_count: number;
  amount: number | string | null;
};

export type LeakCoverageLimit = {
  kind: string;
  account_id: string | null;
  account_label: string | null;
  start: string | null;
  end: string | null;
  message: string;
  materially_limits: boolean;
};

/** Optional evidence block; absent on older backends. */
export type LeakAnalysis = {
  source_accounts: LeakAnalysisSourceAccount[];
  cross_account: boolean;
  account_pattern: LeakAccountPattern | null;
  date_range_start: string | null;
  date_range_end: string | null;
  window_rule: string;
  amount: number | string | null;
  currency: string | null;
  amount_status: LeakAmountStatus;
  confidence_level: LeakConfidenceLevel | null;
  confidence_notes: string[];
  coverage_limits: LeakCoverageLimit[];
  calculation: string;
  overlaps_with: string[];
  counted_in_total: boolean;
};

export type LeakAnalysisSummary = {
  non_overlapping_amount_by_currency: Record<string, number | string>;
  coverage_summary: string[];
  disclaimer: string;
};

export type LeakDetection = {
  leak_id: string;
  fingerprint: string;
  leak_type: string;
  title: string;
  description: string;
  severity: LeakSeverity;
  confidence: number;
  status: LeakStatus;
  estimated_monthly_impact: number | string;
  estimated_annual_impact: number | string | null;
  impact_kind: LeakImpactKind;
  evidence: Record<string, unknown>;
  supporting_behavior_ids: string[];
  supporting_feature_references: string[];
  supporting_transactions: SupportingTransaction[];
  supporting_transaction_count: number;
  detector_version: string;
  detected_at: string;
  period_start: string | null;
  period_end: string | null;
  analysis?: LeakAnalysis | null;
};

export type LeakDetectionResult = {
  user_id: string;
  transaction_count: number;
  period_start: string | null;
  period_end: string | null;
  detector_version: string;
  leaks: LeakDetection[];
  analysis_summary?: LeakAnalysisSummary | null;
};
