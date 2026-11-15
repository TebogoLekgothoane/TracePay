import { formatRandAmount, parseRandAmount } from "../../utils/currency";
import type { PotentialLeak, ReviewIcon } from "./potential-leaks";

/** Clear findings when there are more than two real leaks. */
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
  /** Blurred rows. Only shown when there are enough findings for a blur to make sense. */
  locked: LockedLeak[];
  /** Findings behind the paywall that get no row at all (the two-finding case). */
  hiddenCount: number;
};

export function estimatedMonthlyCost(leak: PotentialLeak): number {
  return parseRandAmount(leak.amount);
}

export function rankLeaksByMonthlyCost(leaks: PotentialLeak[]): PotentialLeak[] {
  return [...leaks].sort(
    (a, b) =>
      (b.priority ?? 0) - (a.priority ?? 0) || estimatedMonthlyCost(b) - estimatedMonthlyCost(a),
  );
}

export function totalMonthlyLeaks(leaks: PotentialLeak[]): string {
  return formatRandAmount(leaks.reduce((sum, leak) => sum + estimatedMonthlyCost(leak), 0));
}

/**
 * Only real findings are shown.
 * - 1 finding: that one stays clear
 * - 2 findings: top one clear, the other gets no row (no lone blurred card); the unlock
 *   button says one more finding is included
 * - 3+: top two clear, the rest blurred
 */
export function splitLeaksForPaywall(leaks: PotentialLeak[]): LeakPaywallView {
  const ranked = rankLeaksByMonthlyCost(leaks);
  const clearCount = clearCountFor(ranked.length);
  const behind = ranked.slice(clearCount);
  const blur = ranked.length > FREE_LEAK_COUNT;
  return {
    preview: ranked.slice(0, clearCount),
    locked: blur
      ? behind.map((leak) => ({ id: leak.id, icon: leak.icon, monthlyAmount: leak.amount }))
      : [],
    hiddenCount: blur ? 0 : behind.length,
  };
}

function clearCountFor(total: number): number {
  return total <= FREE_LEAK_COUNT ? Math.min(1, total) : FREE_LEAK_COUNT;
}

export function isLeakLocked(leaks: PotentialLeak[], leakId: string, unlocked: boolean): boolean {
  if (unlocked) return false;
  const ranked = rankLeaksByMonthlyCost(leaks);
  return ranked.slice(clearCountFor(ranked.length)).some((leak) => leak.id === leakId);
}
