export function parseRandAmount(value: string): number {
  const parsed = Number(value.replace(/[R,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatRandAmount(value: number): string {
  const formatted = Math.abs(value).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}R${formatted}`;
}
