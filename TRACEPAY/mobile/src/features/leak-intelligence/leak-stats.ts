import type { LeakDetection, LeakDetectionResult } from "./leak-intelligence.types";

export type LeakTypeStat = {
  key: string;
  label: string;
  /** Monthly cost in rand. */
  amount: number;
  count: number;
};

export type LeakStats = {
  /** Findings that are still open and not already counted inside another finding. */
  count: number;
  monthly: number;
  yearly: number;
  byType: LeakTypeStat[];
  largest: { title: string; amount: number } | null;
};

/** "bank_fee_leak" -> "Bank fee", "unknown_recurring_payment" -> "Unknown recurring payment". */
export function leakTypeLabel(leakType: string): string {
  const words = leakType.replace(/_leak$/, "").replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Other";
}

function monthlyCost(leak: LeakDetection): number {
  const value = Number(leak.estimated_monthly_impact);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Totals for the leaks the user can still act on. Closed findings, and findings that overlap
 * another one (`counted_in_total` false), are left out so nothing is counted twice.
 */
export function buildLeakStats(result: LeakDetectionResult | null | undefined): LeakStats | null {
  if (!result) return null;

  const open = result.leaks.filter(
    (leak) =>
      (leak.status === "active" || leak.status === "monitoring") &&
      leak.analysis?.counted_in_total !== false &&
      monthlyCost(leak) > 0,
  );
  if (open.length === 0) return null;

  const groups = new Map<string, LeakTypeStat>();
  for (const leak of open) {
    const entry = groups.get(leak.leak_type) ?? {
      key: leak.leak_type,
      label: leakTypeLabel(leak.leak_type),
      amount: 0,
      count: 0,
    };
    entry.amount += monthlyCost(leak);
    entry.count += 1;
    groups.set(leak.leak_type, entry);
  }

  const monthly = open.reduce((sum, leak) => sum + monthlyCost(leak), 0);
  const top = open.reduce((best, leak) => (monthlyCost(leak) > monthlyCost(best) ? leak : best), open[0]!);

  return {
    count: open.length,
    monthly,
    yearly: monthly * 12,
    byType: [...groups.values()].sort((a, b) => b.amount - a.amount),
    largest: { title: top.title, amount: monthlyCost(top) },
  };
}
