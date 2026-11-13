import {
  formatIntervalDays,
  formatRecurrenceStrength,
  formatSubscriptionSource,
  formatSubscriptionsSummary,
} from "./subscriptions.format";
import { parseFinancialFeaturesSubscriptions } from "./subscriptions.parse";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name: string, run: () => void) {
  try {
    run();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("formats subscription labels", () => {
  assert(formatSubscriptionSource("subscription_category") === "Subscription", "source");
  assert(formatRecurrenceStrength("high") === "High", "strength");
  assert(formatIntervalDays(30) === "About monthly", "monthly interval");
  assert(
    formatSubscriptionsSummary(2, 298).includes("2 subscriptions"),
    "summary count",
  );
});

test("extracts subscription merchants from financial features", () => {
  const result = parseFinancialFeaturesSubscriptions({
    transaction_count: 12,
    date_start: "2026-07-01",
    date_end: "2026-09-30",
    merchants: [
      {
        merchant_name: "NETFLIX",
        merchant_transaction_count: 3,
        merchant_average_amount: "199.00",
        merchant_first_transaction_date: "2026-07-05",
        merchant_last_transaction_date: "2026-09-05",
        merchant_category_transaction_count: { Subscriptions: 3 },
        debit_order_transaction_count: 0,
        recurrence: {
          observation_count: 3,
          average_interval_days: "30.5",
          average_amount: "199.00",
          recurrence_strength: "high",
        },
      },
      {
        merchant_name: "CHECKERS",
        merchant_transaction_count: 8,
        merchant_average_amount: "450.00",
        merchant_category_transaction_count: { Groceries: 8 },
        debit_order_transaction_count: 0,
        recurrence: {
          observation_count: 8,
          average_interval_days: "7",
          average_amount: "450.00",
          recurrence_strength: "medium",
        },
      },
      {
        merchant_name: "WITH CARD AT",
        merchant_transaction_count: 3,
        merchant_category_transaction_count: { Subscriptions: 3 },
        recurrence: {
          observation_count: 3,
          average_amount: "99",
          recurrence_strength: "high",
        },
      },
    ],
  });

  assert(result.subscriptions.length === 1, "only Netflix counted");
  assert(result.subscriptions[0]?.displayName === "Netflix", "display name");
  assert(result.subscriptions[0]?.source === "subscription_category", "source");
  assert(result.monthlyTotal > 0, "monthly total");
  assert(result.periodStart === "2026-07-01", "period start");
});

test("rejects implausible app-store intervals but keeps a monthly subscription", () => {
  const result = parseFinancialFeaturesSubscriptions({
    transaction_count: 10,
    merchants: [
      {
        merchant_name: "APPLE",
        merchant_transaction_count: 4,
        merchant_average_amount: "357.47",
        merchant_category_transaction_count: { Subscriptions: 4 },
        debit_order_transaction_count: 0,
        recurrence: {
          observation_count: 4,
          average_interval_days: "9",
          average_amount: "357.47",
          recurrence_strength: "medium",
        },
      },
      {
        merchant_name: "APPLE.COM/BILL",
        merchant_transaction_count: 2,
        merchant_average_amount: "99.00",
        merchant_category_transaction_count: { Subscriptions: 2 },
        debit_order_transaction_count: 0,
        recurrence: {
          observation_count: 2,
          average_interval_days: "30",
          average_amount: "99.00",
          recurrence_strength: "high",
        },
      },
    ],
  });
  assert(result.subscriptions.length === 1, "monthly app store subscription is retained");
  assert(result.subscriptions[0]?.displayName === "Apple.com/bill", "monthly merchant");
  assert(
    Math.abs((result.subscriptions[0]?.averageAmount ?? 0) - 99) < 0.01,
    "subscription amount",
  );
});

test("detects monthly ChatGPT when categorised and cadence is billing-like", () => {
  const result = parseFinancialFeaturesSubscriptions({
    transaction_count: 8,
    merchants: [
      {
        merchant_name: "CHATGPT",
        merchant_transaction_count: 3,
        merchant_average_amount: "199.00",
        merchant_first_transaction_date: "2026-07-01",
        merchant_last_transaction_date: "2026-09-01",
        merchant_category_transaction_count: { Subscriptions: 3 },
        debit_order_transaction_count: 0,
        recurrence: {
          observation_count: 3,
          average_interval_days: "31",
          average_amount: "199.00",
          recurrence_strength: "high",
        },
      },
    ],
  });
  assert(result.subscriptions.length === 1, "chatgpt subscription");
  assert(result.subscriptions[0]?.displayName === "Chatgpt", "display name");
  assert(
    (result.subscriptions[0]?.monthlyEstimate ?? 0) > 150,
    "monthly estimate from cadence",
  );
});

test("prefers backend per-product subscriptions over merchant aggregates", () => {
  const result = parseFinancialFeaturesSubscriptions({
    transaction_count: 6,
    merchants: [],
    subscriptions: [
      {
        merchant_name: "Apple",
        merchant_key: "APPLE",
        product_key: "APPLE:14.99",
        cadence: "monthly",
        cadence_days: "30",
        current_amount: "14.99",
        amount_history: ["14.99", "14.99"],
        estimated_monthly_cost: "14.99",
        confidence: "high",
        successful_transaction_ids: ["a1", "a2"],
        failed_transaction_ids: [],
        observations: [],
      },
      {
        merchant_name: "Apple",
        merchant_key: "APPLE",
        product_key: "APPLE:179.99",
        cadence: "monthly",
        cadence_days: "30",
        current_amount: "179.99",
        amount_history: ["179.99", "179.99"],
        estimated_monthly_cost: "179.99",
        confidence: "high",
        successful_transaction_ids: ["b1", "b2"],
        failed_transaction_ids: [],
        observations: [],
      },
    ],
  });
  assert(result.subscriptions.length === 2, "keeps both Apple products");
  assert(Math.abs(result.monthlyTotal - 194.98) < 0.01, "uses backend monthly estimates");
});

test("does not resurrect merchant heuristics when backend subscriptions are empty", () => {
  const result = parseFinancialFeaturesSubscriptions({
    transaction_count: 4,
    merchants: [
      {
        merchant_name: "UBER",
        merchant_transaction_count: 2,
        merchant_category_transaction_count: { Subscriptions: 2 },
        recurrence: {
          observation_count: 2,
          average_interval_days: "30",
          average_amount: "99",
          recurrence_strength: "high",
        },
      },
    ],
    subscriptions: [],
  });
  assert(result.subscriptions.length === 0, "backend empty list is authoritative");
});
