/**
 * TEMPORARY DEMO DATA, delete this folder when moving to real data.
 *
 * Used only on the Home screen ("Upcoming payments" and "Insights for you"),
 * and only when the real data for that section is empty. To remove: delete
 * this file and the two `DEMO_MODE` usages in app/(tabs)/index.tsx.
 */

import type { UpcomingPayment } from "../dashboard/upcoming-payments";
import type { SpendingPatternInsight } from "../insights/spending-patterns";

export const DEMO_MODE = true;

function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Dates are relative to today so the demo never looks stale. */
export function demoUpcomingPayments(): UpcomingPayment[] {
  return [
    { id: "demo:netflix", name: "Netflix", date: isoInDays(2), amount: 199, confidence: "high" },
    { id: "demo:vodacom", name: "Vodacom Contract", date: isoInDays(4), amount: 649, confidence: "high" },
    { id: "demo:showmax", name: "Showmax", date: isoInDays(6), amount: 99, confidence: "high" },
    { id: "demo:planetfitness", name: "Planet Fitness", date: isoInDays(9), amount: 459, confidence: "high" },
    { id: "demo:discovery", name: "Discovery Insure", date: isoInDays(13), amount: 1285, confidence: "medium" },
    { id: "demo:spotify", name: "Spotify", date: isoInDays(17), amount: 59.99, confidence: "high" },
  ];
}

export const DEMO_INSIGHTS: SpendingPatternInsight[] = [
  {
    id: "demo-takeaways",
    title: "Takeaways cost you R1,480 this month",
    detail: "Uber Eats and Mr D made up 14 orders, up 32% on last month.",
    amount: 1480,
    count: 14,
    action: "See food spending",
  },
  {
    id: "demo-small-purchases",
    title: "11 small purchases under R50 this week",
    detail: "They add up to R412, mostly at Woolworths and Engen 1-Stop.",
    amount: 412,
    count: 11,
    action: "See small purchases",
  },
  {
    id: "demo-weekend",
    title: "You spend most on Saturdays",
    detail: "Saturday averages R640, nearly double your weekday average of R340.",
    amount: 640,
    count: null,
    action: "See weekday pattern",
  },
  {
    id: "demo-bank-fees",
    title: "R189 in bank fees over the last 30 days",
    detail: "Most came from ATM withdrawals at other banks' machines.",
    amount: 189,
    count: 6,
    action: "See bank fees",
  },
];
