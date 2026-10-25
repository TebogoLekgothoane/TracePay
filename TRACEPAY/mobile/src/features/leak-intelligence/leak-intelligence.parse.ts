import type {
  LeakAccountPattern,
  LeakAmountStatus,
  LeakAnalysis,
  LeakAnalysisSummary,
  LeakConfidenceLevel,
  LeakCoverageLimit,
  LeakDetection,
  LeakDetectionResult,
  LeakImpactKind,
  LeakSeverity,
  LeakStatus,
  SupportingTransaction,
  SupportingTransactionRole,
} from "./leak-intelligence.types";

export class LeakIntelligenceApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LeakIntelligenceApiError";
  }
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
    analysis_summary: parseAnalysisSummary(payload.analysis_summary),
  };
}

const ACCOUNT_PATTERNS: readonly LeakAccountPattern[] = [
  "single_account",
  "consolidated_across_accounts",
  "sequential_move",
  "concurrent_charges",
  "unrelated_accounts",
];

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseCoverageLimits(value: unknown): LeakCoverageLimit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): LeakCoverageLimit[] => {
    if (!isRecord(item) || typeof item.message !== "string" || !item.message.trim()) return [];
    return [
      {
        kind: typeof item.kind === "string" ? item.kind : "unknown",
        account_id: optionalText(item.account_id),
        account_label: optionalText(item.account_label),
        start: optionalText(item.start),
        end: optionalText(item.end),
        message: item.message,
        materially_limits: item.materially_limits === true,
      },
    ];
  });
}

/** Defensive: a missing or malformed block yields null, never throws. */
export function parseLeakAnalysis(value: unknown): LeakAnalysis | null {
  if (!isRecord(value)) return null;
  const status: LeakAmountStatus =
    value.amount_status === "confirmed" || value.amount_status === "potentially_duplicated"
      ? value.amount_status
      : "estimated"; // unknown values must never read as confirmed
  const level: LeakConfidenceLevel | null =
    value.confidence_level === "high" ||
    value.confidence_level === "medium" ||
    value.confidence_level === "low"
      ? value.confidence_level
      : null;
  const pattern = ACCOUNT_PATTERNS.includes(value.account_pattern as LeakAccountPattern)
    ? (value.account_pattern as LeakAccountPattern)
    : null;
  const accounts = Array.isArray(value.source_accounts)
    ? value.source_accounts.flatMap((item) => {
        if (!isRecord(item) || typeof item.label !== "string") return [];
        return [
          {
            account_id: typeof item.account_id === "string" ? item.account_id : "",
            label: item.label,
            transaction_count: isFiniteNumber(item.transaction_count)
              ? Math.max(0, Math.floor(item.transaction_count))
              : 0,
            amount: isMoney(item.amount) ? item.amount : null,
          },
        ];
      })
    : [];
  return {
    source_accounts: accounts,
    cross_account: value.cross_account === true,
    account_pattern: pattern,
    date_range_start: optionalText(value.date_range_start),
    date_range_end: optionalText(value.date_range_end),
    window_rule: typeof value.window_rule === "string" ? value.window_rule : "",
    amount: isMoney(value.amount) ? value.amount : null,
    currency: optionalText(value.currency),
    amount_status: status,
    confidence_level: level,
    confidence_notes: isStringArray(value.confidence_notes) ? value.confidence_notes : [],
    coverage_limits: parseCoverageLimits(value.coverage_limits),
    calculation: typeof value.calculation === "string" ? value.calculation : "",
    overlaps_with: isStringArray(value.overlaps_with) ? value.overlaps_with : [],
    // Only an explicit false suppresses the total note; absent means counted.
    counted_in_total: value.counted_in_total !== false,
  };
}

function parseAnalysisSummary(value: unknown): LeakAnalysisSummary | null {
  if (!isRecord(value)) return null;
  const amounts: Record<string, number | string> = {};
  if (isRecord(value.non_overlapping_amount_by_currency)) {
    for (const [currency, amount] of Object.entries(value.non_overlapping_amount_by_currency)) {
      if (isMoney(amount)) amounts[currency] = amount;
    }
  }
  return {
    non_overlapping_amount_by_currency: amounts,
    coverage_summary: isStringArray(value.coverage_summary) ? value.coverage_summary : [],
    disclaimer: typeof value.disclaimer === "string" ? value.disclaimer : "",
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
    supporting_transactions: parseSupportingTransactions(value.supporting_transactions),
    supporting_transaction_count: isFiniteNumber(value.supporting_transaction_count)
      ? value.supporting_transaction_count
      : 0,
    detector_version: text.detector_version,
    detected_at: text.detected_at,
    period_start: optionalDate(value.period_start),
    period_end: optionalDate(value.period_end),
    analysis: parseLeakAnalysis(value.analysis),
  };
}

const SUPPORTING_ROLES: readonly SupportingTransactionRole[] = [
  "payment",
  "fee",
  "other_fee",
  "failed_attempt_fee",
  "reversal",
];

function parseSupportingTransactions(value: unknown): SupportingTransaction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): SupportingTransaction[] => {
    if (
      !isRecord(item) ||
      typeof item.transaction_id !== "string" ||
      typeof item.date !== "string" ||
      typeof item.description !== "string" ||
      !isMoney(item.amount) ||
      typeof item.direction !== "string" ||
      !SUPPORTING_ROLES.includes(item.role as SupportingTransactionRole)
    ) {
      return [];
    }
    return [
      {
        transaction_id: item.transaction_id,
        date: item.date,
        description: item.description,
        amount: item.amount,
        direction: item.direction,
        role: item.role as SupportingTransactionRole,
      },
    ];
  });
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
