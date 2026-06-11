/** Tailwind classes for budget playbook category accents. */
export const CATEGORY_STYLES: Record<
  string,
  { iconBg: string; iconColor: string; btn: string }
> = {
  Savings: {
    iconBg: "bg-brand-purple-light",
    iconColor: "#7C3AED",
    btn: "bg-brand-purple",
  },
  Groceries: {
    iconBg: "bg-green-100",
    iconColor: "#16A34A",
    btn: "bg-green-600",
  },
  Transport: {
    iconBg: "bg-blue-100",
    iconColor: "#2563EB",
    btn: "bg-blue-600",
  },
  Banking: {
    iconBg: "bg-amber-100",
    iconColor: "#D97706",
    btn: "bg-amber-600",
  },
};

export function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Savings;
}
