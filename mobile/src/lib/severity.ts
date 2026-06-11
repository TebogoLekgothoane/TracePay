export type Severity = "High" | "Medium" | "Low";

export const SEVERITY_STYLES: Record<
  Severity,
  { badge: string; text: string; icon: string }
> = {
  High: { badge: "bg-red-100", text: "text-red-600", icon: "#DC2626" },
  Medium: { badge: "bg-amber-100", text: "text-amber-600", icon: "#D97706" },
  Low: { badge: "bg-yellow-100", text: "text-yellow-600", icon: "#CA8A04" },
};

export function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[severity as Severity] ?? SEVERITY_STYLES.Low;
}
