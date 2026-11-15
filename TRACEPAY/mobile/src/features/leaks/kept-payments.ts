import type {
  LeakDetection,
  LeakDetectionResult,
} from "../leak-intelligence/leak-intelligence.types";

/**
 * A recurring payment is not always a leak. When the user says "I use this", we remember the
 * merchant and stop counting that merchant's findings as leaks. Detected recurring payments and
 * findings share the merchant name, so one key covers both.
 */

export function normaliseMerchantKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** The merchant a finding is about, when it names one. */
export function leakMerchantKey(leak: Pick<LeakDetection, "evidence">): string | null {
  const evidence = leak.evidence ?? {};
  for (const field of ["merchant_key", "merchant_display_name", "merchant_name"]) {
    const value = evidence[field];
    if (typeof value === "string" && value.trim()) return normaliseMerchantKey(value);
  }
  return null;
}

export function isKeptLeak(
  leak: Pick<LeakDetection, "evidence">,
  kept: ReadonlySet<string>,
): boolean {
  const key = leakMerchantKey(leak);
  return key !== null && kept.has(key);
}

/** The same detections with the merchants the user chose to keep taken out. */
export function withoutKept(
  result: LeakDetectionResult | null,
  kept: ReadonlySet<string>,
): LeakDetectionResult | null {
  if (!result || kept.size === 0) return result;
  return { ...result, leaks: result.leaks.filter((leak) => !isKeptLeak(leak, kept)) };
}
