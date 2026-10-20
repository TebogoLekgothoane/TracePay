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

test("rejects implausible app-store intervals and unknown apple charges", () => {
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
  assert(result.subscriptions.length === 0, "app store aggregators need monthly cadence");
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
