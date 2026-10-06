export type LeakImpactKind = "recurring" | "one_time" | "estimated";
export type LeakSeverity = "low" | "medium" | "high";
export type LeakStatus = "active" | "monitoring" | "resolved" | "dismissed";

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
  detector_version: string;
  detected_at: string;
  period_start: string | null;
  period_end: string | null;
};

export type LeakDetectionResult = {
  user_id: string;
  transaction_count: number;
  period_start: string | null;
  period_end: string | null;
  detector_version: string;
  leaks: LeakDetection[];
};
