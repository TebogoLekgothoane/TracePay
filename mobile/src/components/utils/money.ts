export function formatZar(amount: number): string {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for environments without Intl support
    const rounded = Math.round(amount * 100) / 100;
    return `R${rounded.toFixed(2)}`;
  }
}

export type LossStatus = "high" | "medium" | "low";

export function getLossStatus(totalLost: number): LossStatus {
  if (totalLost >= 1500) return "high";
  if (totalLost >= 600) return "medium";
  return "low";
}

