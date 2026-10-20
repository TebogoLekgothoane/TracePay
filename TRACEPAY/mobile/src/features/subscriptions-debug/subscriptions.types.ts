export type SubscriptionRecurrenceStrength = "none" | "low" | "medium" | "high";

export type DetectedSubscription = {
  merchantKey: string;
  displayName: string;
  category: string | null;
  observationCount: number;
  averageAmount: number | null;
  averageIntervalDays: number | null;
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
};
