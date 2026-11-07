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

/** Something the statement rows show outright: a count, an amount, a date. */
export type LeakConfirmedFact = {
  text: string;
  figures: Record<string, unknown>;
};

/** What the pattern only suggests. `cannot_see` is what a statement cannot show. */
export type LeakPossibleClaim = {
  text: string;
  cannot_see: string[];
  check: string | null;
};

/**
 * Two different claims about one finding. `confirmed` is true of the user's
 * statements ("You paid this fee 17 times"); `possible` is a hypothesis
 * ("You may be able to avoid this fee") that statements cannot settle.
 */
export type LeakClaims = {
  confirmed: LeakConfirmedFact[];
  /** What the user told us. Not proven by a statement, and not a guess. */
  reported: LeakReportedFact[];
  possible: LeakPossibleClaim[];
  /** What the user's answer did to the finding. It never changes the confirmed facts. */
  user_effect: LeakUserEffect;
};

export type LeakReportedFact = {
  text: string;
  question_kind: string;
  answer: string;
};

export type LeakUserEffect = "none" | "strengthens" | "weakens" | "resolves";

export type FindingQuestionKind =
  | "subscription_usage"
  | "cancelled_in"
  | "duplicate_expected"
  | "data_usage"
  | "insurance_cover"
  | "bank_account"
  | "payment_purpose"
  | "transfer_purpose";

export type FindingQuestionOption = {
  value: string;
  label: string;
};

/** A question TracePay asks because the answer could change a finding. */
export type FindingQuestion = {
  question_key: string;
  kind: FindingQuestionKind;
  leak_id: string;
  leak_type: string;
  subject: string;
  prompt: string;
  why_asked: string;
  context: string[];
  options: FindingQuestionOption[];
  can_skip: boolean;
  priority: number;
  /** Sent back with the answer so a materially changed finding can reopen it. */
  signature: string;
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
  claims?: LeakClaims | null;
  /** Absent on older backends; such findings are read as worth reviewing. */
  value_group?: LeakValueGroup | null;
};

/** Never combined into one "money lost" figure. */
export type LeakValueGroup = "recoverable" | "review" | "commitment";

/** A look-alike the engine looked at and did not raise, with the plain reason. */
export type LeakNearMiss = {
  leak_type: string;
  reason_code: string;
  reason: string;
  merchant: string | null;
  merchant_display_name: string | null;
  amount: number | string;
  dates: string[];
};

/** A price that fell. Not a leak, never counted as money found, and never in a total. */
export type LeakGoodNews = {
  key: string;
  title: string;
  /** One sentence, with **bold** markers around the figures that matter. */
  line: string;
};

export type LeakDetectionResult = {
  user_id: string;
  transaction_count: number;
  period_start: string | null;
  period_end: string | null;
  detector_version: string;
  leaks: LeakDetection[];
  analysis_summary?: LeakAnalysisSummary | null;
  questions: FindingQuestion[];
  questions_not_shown: number;
  /** Absent on older backends. For tuning; never shown as a finding. */
  near_misses?: LeakNearMiss[];
  /** Absent on older backends. Prices that fell, shown beside the findings. */
  good_news?: LeakGoodNews[];
};
