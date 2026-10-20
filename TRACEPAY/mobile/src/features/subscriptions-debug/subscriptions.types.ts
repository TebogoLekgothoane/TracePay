export type SubscriptionRecurrenceStrength = "none" | "low" | "medium" | "high";

export type SubscriptionObservation = {
  transactionId: string;
  date: string | null;
  amount: number;
  outcome: "successful" | "failed" | "fee" | "reversal";
  feeAmount: number | null;
  referencedAmount: number | null;
};

export type DetectedSubscription = {
  merchantKey: string;
  productKey?: string;
  displayName: string;
  category: string | null;
  observationCount: number;
  averageAmount: number | null;
  typicalAmount: number | null;
  latestAmount: number | null;
  observedAmounts: number[];
  failedPaymentAttemptCount: number;
  failedPaymentAttemptAmounts: number[];
  status?: "active" | "late" | "failed_recently" | "ended";
  currentAmount?: number | null;
  amountHistory?: number[];
  expectedDayOfMonth?: number | null;
  lastSuccessfulCharge?: string | null;
  nextExpectedDate?: string | null;
  totalFailureFees?: number;
  observations?: SubscriptionObservation[];
  averageIntervalDays: number | null;
  medianIntervalDays: number | null;
  recurrenceStrength: SubscriptionRecurrenceStrength;
  firstObservedDate: string | null;
  lastObservedDate: string | null;
  monthlyEstimate: number | null;
  debitOrderCount: number;
  transactionCount: number;
  source: "subscription_category" | "recurring_debit_order" | "streaming_overlap";
};

export type SubscriptionsDebugResult = {
  transactionCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  subscriptions: DetectedSubscription[];
  monthlyTotal: number;
  aiAnalysis?: import("../../api/anthropic-analysis.api").AnthropicAnalysis | null;
};
