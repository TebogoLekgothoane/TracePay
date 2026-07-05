export function simulateBudgetGenerate(
  income: number,
  leaks: { name: string; amountMonthly: number; category: string }[],
) {
  const weeklyAmount = Math.round(income / 4.33);
  const dailyLimit = Math.round(weeklyAmount / 7);
  const totalLeaks = leaks.reduce((s, l) => s + l.amountMonthly, 0);
  const buffer = Math.round(weeklyAmount * 0.15);

  const playbook =
    totalLeaks > 0
      ? leaks.map((l) => ({
          name: l.name,
          category: l.category,
          saving: Math.round(l.amountMonthly),
          detail: `You're losing R${l.amountMonthly.toFixed(2)}/month to ${l.name}. Review and cancel if you no longer need it.`,
          actionText: "REVIEW",
          btnText: "Review this charge",
        }))
      : [];

  return { weeklyAmount, dailyLimit, buffer, playbook };
}
