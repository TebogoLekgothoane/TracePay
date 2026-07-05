export function simulateBudgetGenerate(
  income: number,
  leaks: { name: string; amountMonthly: number; category: string }[],
) {
  const weeklyAmount = Math.round(income / 4.33);
  const dailyLimit = Math.round(weeklyAmount / 7);
  const totalLeaks = leaks.reduce((s, l) => s + l.amountMonthly, 0);
  const obligationsTotal = Math.round(weeklyAmount * 0.55 + totalLeaks * 0.25);
  const buffer = Math.round(weeklyAmount * 0.15);
  const riskLevel =
    totalLeaks > 150 ? "High" : totalLeaks > 60 ? "Medium" : "Low";

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

  return {
    weekStart: new Date().toISOString().split("T")[0],
    weeklyAmount,
    dailyLimit,
    obligationsTotal,
    buffer,
    billsPct: 35,
    bufferPct: 15,
    freePct: 50,
    riskLevel,
    riskDescription:
      riskLevel === "Low"
        ? "Your spending is stable with no high-risk leaks. Keep reviewing subscriptions monthly."
        : `You have R${Math.round(totalLeaks)} leaking monthly. Freezing leaks could improve your weekly budget.`,
    obligations: [
      {
        name: "Stokvel Contribution",
        dueDate: "Due 15 Apr",
        amount: 200,
        icon: "calendar-month-outline",
      },
      {
        name: "Planet Fitness Debit",
        dueDate: "Due 01 Apr",
        amount: 199,
        icon: "calendar-month-outline",
      },
      {
        name: "Groceries",
        dueDate: "Due Weekly",
        amount: Math.min(650, Math.round(weeklyAmount * 0.35)),
        icon: "cart-outline",
      },
      {
        name: "Transport Costs",
        dueDate: "Due Weekly",
        amount: 100,
        icon: "bus",
      },
    ],
    playbook,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}
