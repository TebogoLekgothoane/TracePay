const zarFormat = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const numFormat = new Intl.NumberFormat("en-ZA");

export const zar = (value: number): string => zarFormat.format(value);
export const num = (value: number): string => numFormat.format(value);
export const pct = (value: number | null | undefined): string => `${Number(value || 0).toFixed(1)}%`;

export const usd = (value: number | null | undefined): string => {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 1 ? 4 : 2,
  }).format(n);
};

export const ms = (value: number | null | undefined): string =>
  value == null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${num(value)} ms`;

export const when = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—";

export const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

export const capitalise = (text: string | null | undefined): string => {
  const s = String(text ?? "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : s;
};

export const productName = (key: string): string =>
  ({ full_analysis: "Full analysis", annual_monitoring: "Annual monitoring" })[key] ?? key;
