import { formatRandAmount } from "../../utils/currency";

/** 3900 -> "R39,00" in the South African format the rest of the app uses. */
export function formatCents(cents: number): string {
  return formatRandAmount(cents / 100);
}

/** Whole-rand price for headings and buttons: 3900 -> "R39". */
export function formatWholeRand(cents: number): string {
  const rand = cents / 100;
  return Number.isInteger(rand) ? `R${rand}` : formatCents(cents);
}

export function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}
