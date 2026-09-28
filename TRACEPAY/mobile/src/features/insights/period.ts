import { formatRandAmount, parseRandAmount } from "../../utils/currency";

export const PERIODS = ["This month", "Last month", "3 months", "Custom"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIODS_WITHOUT_CUSTOM = [
  "This month",
  "Last month",
  "3 months",
] as const;

export type PeriodWithoutCustom = (typeof PERIODS_WITHOUT_CUSTOM)[number];

export const CUSTOM_RANGES = [
  "Last 7 days",
  "Last 14 days",
  "Year to date",
] as const;
export type CustomRange = (typeof CUSTOM_RANGES)[number];

/** Relative size of mock totals vs "This month". */
export const PERIOD_FACTORS: Record<Period, number> = {
  "This month": 1,
  "Last month": 0.88,
  "3 months": 2.85,
  Custom: 0.42,
};

export const CUSTOM_RANGE_FACTORS: Record<CustomRange, number> = {
  "Last 7 days": 0.28,
  "Last 14 days": 0.42,
  "Year to date": 7.4,
};

export { formatRandAmount, parseRandAmount };

export function scaleRandAmount(value: string, scale: number): string {
  return formatRandAmount(parseRandAmount(value) * scale);
}

export function periodFactor(
  period: Period,
  customRange: CustomRange = "Last 14 days",
): number {
  if (period === "Custom") return CUSTOM_RANGE_FACTORS[customRange];
  return PERIOD_FACTORS[period];
}

export function periodChangeLabel(period: Period): string {
  if (period === "Last month") return "↓ 6% vs prior month";
  if (period === "3 months") return "↑ 11% vs prior 3 months";
  if (period === "Custom") return "For selected range";
  return "↑ 14% vs last month";
}

export function periodComparisonCopy(period: Period): string {
  if (period === "Last month") return "Last month vs prior month";
  if (period === "3 months") return "Last 3 months vs prior 3 months";
  if (period === "Custom") return "Selected range vs prior range";
  return "This month vs last month";
}
