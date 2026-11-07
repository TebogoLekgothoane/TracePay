/**
 * Leak categories for the debug pages. They mirror the Leak breakdown on the
 * Leaks tab (fees, subs, airtime, debit) so a debug page lines up with what the
 * user sees; cash and everything else get their own tiles so no finding is
 * left out. Subscriptions open the existing Subscriptions debug page.
 */
export type LeakDebugCategory = {
  /** Matches the id the Leaks tab uses where there is one. */
  key: string;
  title: string;
  blurb: string;
  leakTypes: readonly string[];
  /** Opens this page instead of the generic category page. */
  href?: string;
};

export const LEAK_DEBUG_CATEGORIES: readonly LeakDebugCategory[] = [
  {
    key: "fees",
    title: "Bank fees",
    blurb: "Account, card, transaction and penalty fees.",
    leakTypes: ["bank_fee_leak", "penalty_fee_leak"],
  },
  {
    key: "subs",
    title: "Subscriptions",
    blurb: "Recurring subscriptions and overlapping services.",
    leakTypes: ["subscription_leak", "duplicate_streaming_leak"],
    href: "/debug/subscriptions",
  },
  {
    key: "airtime",
    title: "Airtime & Data",
    blurb: "Airtime and data top-ups.",
    leakTypes: ["airtime_data_leak"],
  },
  {
    key: "debit",
    title: "Debit orders",
    blurb: "Repeating payments, missed payments, duplicates and regular transfers.",
    leakTypes: [
      "recurring_payment_leak",
      "unknown_recurring_payment",
      "inactive_recurring_payment_leak",
      "duplicate_debit_order_leak",
      "duplicate_payment_leak",
      "recurring_transfer_leak",
    ],
  },
  {
    key: "atm",
    title: "Cash & ATM",
    blurb: "Cash withdrawals and cash spending.",
    leakTypes: ["cash_usage_leak"],
  },
  {
    key: "other",
    title: "Other",
    blurb:
      "Spending increases, habits, high-cost credit, unusual payments, overlapping cover and deposits paid out.",
    leakTypes: [
      "spending_escalation_leak",
      "food_spending_leak",
      "transport_spending_leak",
      "coffee_spending_leak",
      "convenience_store_leak",
      "weekend_spending_leak",
      "payday_spending_leak",
      "gambling_spending_leak",
      "high_cost_credit_leak",
      "irregular_transaction_leak",
      "overlapping_cover_leak",
      "money_pass_through_leak",
    ],
  },
];

export function leakDebugCategoryByKey(key: string | undefined): LeakDebugCategory | null {
  return LEAK_DEBUG_CATEGORIES.find((category) => category.key === key) ?? null;
}

export function belongsToCategory(
  category: LeakDebugCategory,
  item: { leak_type: string },
): boolean {
  return category.leakTypes.includes(item.leak_type);
}

export function categoryHref(category: LeakDebugCategory): string {
  return category.href ?? `/debug/leak-category/${category.key}`;
}

export type CategoryTotal = { count: number; monthly: number };

/**
 * Findings and monthly cost per category. Like the Leaks tab totals, closed
 * findings and ones counted inside another finding add no cost, so nothing is
 * counted twice.
 */
export function categoryTotal(
  category: LeakDebugCategory,
  leaks: ReadonlyArray<{
    leak_type: string;
    status?: string;
    estimated_monthly_impact: number | string | null;
    analysis?: { counted_in_total?: boolean } | null;
  }>,
): CategoryTotal {
  let count = 0;
  let monthly = 0;
  for (const leak of leaks) {
    if (!belongsToCategory(category, leak)) continue;
    count += 1;
    const open = leak.status === "active" || leak.status === "monitoring";
    const value = Number(leak.estimated_monthly_impact);
    if (open && leak.analysis?.counted_in_total !== false && Number.isFinite(value) && value > 0) {
      monthly += value;
    }
  }
  return { count, monthly };
}
