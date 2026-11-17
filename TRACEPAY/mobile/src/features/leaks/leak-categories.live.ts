/**
 * Hydrate the Leaks tab category tiles from live leak detections.
 * Keeps visual metadata (icons, tints) from LEAK_CATEGORIES;
 * amounts, change labels and merchant logos come from the user's findings only.
 */

import { formatRandAmount } from "../../utils/currency";
import type { LeakPreview } from "../../components/dashboard/LeakSummary";
import {
  belongsToCategory,
  categoryTotal,
  countsAsLeak,
  isVisibleLeak,
  LEAK_DEBUG_CATEGORIES,
  leakDebugCategoryByKey,
} from "../leak-intelligence/leak-debug-categories";
import type { LeakDetectionResult } from "../leak-intelligence/leak-intelligence.types";
import type { DetectedSubscription } from "../subscriptions-debug/subscriptions.types";
import { merchantDisplayName } from "../leak-intelligence/leak-intelligence.format";
import { resolveLogoDomainFromMerchantLabel } from "../transactions/merchant-logos";
import { LEAK_CATEGORIES } from "./leak-categories";
import { chargesFromDetected } from "./recurring-charges.catalog";
import { parseRandAmount } from "../../utils/currency";

const MAX_LOGOS = 3;

/** Brands from the user's own open findings in this category, with real logos only. */
function merchantsFor(
  category: NonNullable<ReturnType<typeof leakDebugCategoryByKey>>,
  leaks: LeakDetectionResult["leaks"],
  subscriptions: readonly DetectedSubscription[],
): { merchants: LeakPreview["merchants"]; moreCount: number } {
  const seen = new Map<string, { id: string; name: string; logoDomain: string }>();
  // Recurring Payments: the same detected recurring charges the subscriptions list shows,
  // biggest first, so the card's logos match that list.
  if (category.key === "subs") {
    const charges = chargesFromDetected(subscriptions).sort(
      (a, b) => parseRandAmount(b.amount) - parseRandAmount(a.amount),
    );
    for (const charge of charges) {
      if (!charge.logoDomain || seen.has(charge.logoDomain)) continue;
      seen.set(charge.logoDomain, {
        id: charge.logoDomain,
        name: charge.name,
        logoDomain: charge.logoDomain,
      });
    }
  }
  for (const leak of leaks) {
    if (!isVisibleLeak(leak) || !belongsToCategory(category, leak) || !countsAsLeak(leak)) continue;
    if (leak.status !== "active" && leak.status !== "monitoring") continue;
    const name = merchantDisplayName(leak.evidence ?? {});
    const logoDomain = resolveLogoDomainFromMerchantLabel(name);
    if (!name || !logoDomain || seen.has(logoDomain)) continue;
    seen.set(logoDomain, { id: logoDomain, name, logoDomain });
  }
  const all = [...seen.values()];
  return { merchants: all.slice(0, MAX_LOGOS), moreCount: Math.max(0, all.length - MAX_LOGOS) };
}

export type LiveLeakCategoryPreview = LeakPreview & {
  monthly: number;
  findingCount: number;
};

function changeLabel(monthly: number, findingCount: number): {
  change: string;
  changeDirection: "up" | "down";
} {
  if (findingCount === 0 || monthly <= 0) {
    return { change: "No open findings", changeDirection: "down" };
  }
  return {
    change: `${findingCount} ${findingCount === 1 ? "finding" : "findings"}`,
    changeDirection: "up",
  };
}

/** Category cards for the Leaks tab, totals from live detections. */
export function buildLiveLeakCategories(
  result: LeakDetectionResult | null | undefined,
  subscriptions: readonly DetectedSubscription[] = [],
): LiveLeakCategoryPreview[] {
  const leaks = result?.leaks ?? [];
  return LEAK_CATEGORIES.map((base) => {
    const debug = leakDebugCategoryByKey(base.id) ?? LEAK_DEBUG_CATEGORIES[0]!;
    const totals = categoryTotal(debug, leaks);
    const { change, changeDirection } = changeLabel(totals.monthly, totals.count);
    const { merchants, moreCount } = merchantsFor(debug, leaks, subscriptions);
    return {
      ...base,
      merchants,
      moreCount,
      amount: formatRandAmount(totals.monthly),
      change,
      changeDirection,
      monthly: totals.monthly,
      findingCount: totals.count,
    };
  });
}

/** Monthly leak total across the four Leaks-tab categories (no double-counting). */
export function liveLeakCategoriesMonthlyTotal(
  categories: readonly LiveLeakCategoryPreview[],
): number {
  return categories.reduce((sum, category) => sum + category.monthly, 0);
}
