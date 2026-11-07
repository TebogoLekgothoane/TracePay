/** The only figures kept. Anything else the processor sends is ignored. */
export const PRINTED_FIGURE_KEYS = [
  "statement_date",
  "debit_interest_rate",
  "credit_interest_rate",
  "facility",
  "card_purchases",
  "fees_total",
  "interest_paid",
  "interest_received",
] as const;

/**
 * Figures a statement printed outside its rows (interest rates, facility, summary totals),
 * exactly as read: numbers as text so no digit is lost, the date as ISO. Never estimated.
 */
export type PrintedFigures = Partial<Record<(typeof PRINTED_FIGURE_KEYS)[number], string>>;

/** Keeps the known figures as text; null when the statement printed none. */
export function readPrintedFigures(value: unknown): PrintedFigures | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kept: PrintedFigures = {};
  for (const key of PRINTED_FIGURE_KEYS) {
    const raw = record[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      kept[key] = String(raw);
    } else if (typeof raw === "string" && raw.trim().length > 0 && raw.length <= 32) {
      kept[key] = raw.trim();
    }
  }
  return Object.keys(kept).length > 0 ? kept : null;
}
