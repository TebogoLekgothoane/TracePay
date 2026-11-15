/**
 * Hydrate the Leaks tab category tiles from live leak detections.
 * Keeps visual metadata (icons, tints, merchant chips) from LEAK_CATEGORIES;
 * amounts and change labels come from the user's findings only.
 */

import { formatRandAmount } from "../../utils/currency";
import type { LeakPreview } from "../../components/dashboard/LeakSummary";
import {
  categoryTotal,
  LEAK_DEBUG_CATEGORIES,
  leakDebugCategoryByKey,
} from "../leak-intelligence/leak-debug-categories";
import type { LeakDetectionResult } from "../leak-intelligence/leak-intelligence.types";
import { LEAK_CATEGORIES } from "./leak-categories";

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
): LiveLeakCategoryPreview[] {
  const leaks = result?.leaks ?? [];
  return LEAK_CATEGORIES.map((base) => {
    const debug = leakDebugCategoryByKey(base.id) ?? LEAK_DEBUG_CATEGORIES[0]!;
    const totals = categoryTotal(debug, leaks);
    const { change, changeDirection } = changeLabel(totals.monthly, totals.count);
    return {
      ...base,
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
