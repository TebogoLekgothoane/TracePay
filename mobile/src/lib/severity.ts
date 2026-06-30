export type Severity = "High" | "Medium" | "Low";

export const SEVERITY_STYLES: Record<
  Severity,
  { badge: string; text: string; icon: string }
> = {
  High: {
    badge: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-600 dark:text-red-400",
    icon: "#DC2626",
  },
  Medium: {
    badge: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-600 dark:text-amber-400",
    icon: "#D97706",
  },
  Low: {
    badge: "bg-yellow-100 dark:bg-yellow-900/40",
    text: "text-yellow-600 dark:text-yellow-400",
    icon: "#CA8A04",
  },
};

export function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[severity as Severity] ?? SEVERITY_STYLES.Low;
}
