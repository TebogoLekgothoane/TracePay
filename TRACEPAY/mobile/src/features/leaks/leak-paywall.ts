import { formatRandAmount, parseRandAmount } from "../../utils/currency";
import type { PotentialLeak, ReviewIcon } from "./potential-leaks";

/** Leaks a user can open in full before upgrading. */
export const FREE_LEAK_COUNT = 2;

export const ANNUAL_PLAN = {
  price: "R299",
  monthlyEquivalent: "R25",
} as const;

/**
 * What a locked row is allowed to know about a leak. The title, merchant and
 * evidence stay out of this shape so locked rows can't render them.
 */
export type LockedLeak = {
  id: string;
  icon: ReviewIcon;
  monthlyAmount: string;
};

export type LeakPaywallView = {
  preview: PotentialLeak[];
  locked: LockedLeak[];
};

export function estimatedMonthlyCost(leak: PotentialLeak): number {
  return parseRandAmount(leak.amount);
}

export function rankLeaksByMonthlyCost(leaks: PotentialLeak[]): PotentialLeak[] {
  return [...leaks].sort((a, b) => estimatedMonthlyCost(b) - estimatedMonthlyCost(a));
}

export function totalMonthlyLeaks(leaks: PotentialLeak[]): string {
  return formatRandAmount(leaks.reduce((sum, leak) => sum + estimatedMonthlyCost(leak), 0));
}

export function splitLeaksForPaywall(leaks: PotentialLeak[]): LeakPaywallView {
  const ranked = rankLeaksByMonthlyCost(leaks);
  return {
    preview: ranked.slice(0, FREE_LEAK_COUNT),
    locked: ranked.slice(FREE_LEAK_COUNT).map((leak) => ({
      id: leak.id,
      icon: leak.icon,
      monthlyAmount: leak.amount,
    })),
  };
}

export function isLeakLocked(leaks: PotentialLeak[], leakId: string, unlocked: boolean): boolean {
  if (unlocked) return false;
  return splitLeaksForPaywall(leaks).locked.some((leak) => leak.id === leakId);
}
