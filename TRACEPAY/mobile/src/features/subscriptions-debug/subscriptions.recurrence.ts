/** Mirrors backend `recurrence_rules.py` for subscription UI eligibility. */

const MAX_FREQUENT_INTERVAL_DAYS = 3;

const RECURRING_INTERVAL_WINDOWS: Array<{ center: number; tolerance: number }> = [
  { center: 7, tolerance: 2 },
  { center: 14, tolerance: 3 },
  { center: 21, tolerance: 4 },
  { center: 30, tolerance: 5 },
  { center: 60, tolerance: 5 },
  { center: 90, tolerance: 6 },
  { center: 180, tolerance: 12 },
  { center: 365, tolerance: 21 },
];

export function isImplausiblyFrequentInterval(
  averageIntervalDays: number | null,
): boolean {
  if (averageIntervalDays === null || !Number.isFinite(averageIntervalDays)) {
    return true;
  }
  return averageIntervalDays <= MAX_FREQUENT_INTERVAL_DAYS;
}

export function matchesPlausibleRecurringInterval(
  averageIntervalDays: number | null,
): boolean {
  if (
    averageIntervalDays === null ||
    !Number.isFinite(averageIntervalDays) ||
    isImplausiblyFrequentInterval(averageIntervalDays)
  ) {
    return false;
  }
  if (averageIntervalDays > 400) {
    return false;
  }
  if (averageIntervalDays >= 28 && averageIntervalDays <= 35) {
    return true;
  }
  if (averageIntervalDays >= 56 && averageIntervalDays <= 65) {
    return true;
  }
  if (averageIntervalDays >= 84 && averageIntervalDays <= 95) {
    return true;
  }
  return RECURRING_INTERVAL_WINDOWS.some(
    ({ center, tolerance }) =>
      Math.abs(averageIntervalDays - center) <= tolerance,
  );
}

/** App-store aggregators can bundle many unrelated renewals under one merchant key. */
export function isAppStoreBillingAggregator(merchantKey: string): boolean {
  const upper = merchantKey.trim().toUpperCase();
  if (!upper) {
    return false;
  }
  if (
    upper === "APPLE" ||
    upper === "ITUNES" ||
    upper === "GOOGLE" ||
    upper === "GOOGLE PLAY" ||
    upper === "APPLE COM"
  ) {
    return true;
  }
  return (
    upper.includes("APPLE.COM") ||
    upper.includes("APPLE COM BILL") ||
    upper.includes("GOOGLE *SERVICES")
  );
}
