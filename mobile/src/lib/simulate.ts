export interface SimulatedLeak {
  name: string;
  category: string;
  categoryIcon: string;
  amountMonthly: number;
  severity: "High" | "Medium" | "Low";
  sourceSms: string;
  advice: string;
}

const SMS_LEAK_RULES: {
  match: (text: string) => boolean;
  leak: SimulatedLeak;
}[] = [
  {
    match: (t) => t.includes("iflix") || t.includes("subscription"),
    leak: {
      name: "iflix Subscription",
      category: "Zombie Subscription",
      categoryIcon: "television-play",
      amountMonthly: 49.99,
      severity: "Medium",
      sourceSms: "MTN: R49.99 deducted for iflix subscription.",
      advice: "Dial *141*9# on your MTN SIM to cancel iflix and stop the monthly charge.",
    },
  },
  {
    match: (t) => t.includes("loan") || t.includes("interest"),
    leak: {
      name: "Capitec Loan Interest",
      category: "Loan Interest",
      categoryIcon: "cash",
      amountMonthly: 87.5,
      severity: "High",
      sourceSms: "Capitec: Loan repayment + interest charged.",
      advice: "Request a loan restructure at Capitec to reduce total interest paid.",
    },
  },
  {
    match: (t) => t.includes("airtime advance") || t.includes("advance"),
    leak: {
      name: "Vodacom Airtime Advance Fee",
      category: "Airtime Advance Fee",
      categoryIcon: "phone",
      amountMonthly: 32.4,
      severity: "High",
      sourceSms: "Vodacom: Airtime advance approved with fee.",
      advice: "Buy a weekly data bundle via MyVodacom instead of using airtime advances.",
    },
  },
  {
    match: (t) => t.includes("atm fee") || t.includes("atm"),
    leak: {
      name: "Cross-Bank ATM Fee",
      category: "ATM Fee",
      categoryIcon: "bank-outline",
      amountMonthly: 42,
      severity: "Medium",
      sourceSms: "ATM fee charged at another bank's ATM.",
      advice: "Use your own bank's ATMs or Capitec Global One for fee-free withdrawals.",
    },
  },
];

/** Always returns exactly three demo leaks for the SMS scan flow. */
export function simulateSmsAnalysis(_messages: string[]) {
  const leaks: SimulatedLeak[] = [
    SMS_LEAK_RULES[0].leak,
    SMS_LEAK_RULES[1].leak,
    SMS_LEAK_RULES[2].leak,
  ];

  const totalMonthly = leaks.reduce((sum, l) => sum + l.amountMonthly, 0);
  return { leaks, totalMonthly: Math.round(totalMonthly * 100) / 100 };
}

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
    playbook: [
      {
        name: "Cancel iflix via MTN USSD",
        category: "Savings",
        saving: 50,
        detail:
          "You're being charged R49.99/month for iflix. Dial *141*9# on your MTN SIM to cancel instantly.",
        actionText: "CANCEL",
        btnText: "Dial *141*9# to cancel",
      },
      {
        name: "Switch to Capitec ATMs only",
        category: "Banking",
        saving: 126,
        detail:
          "Capitec-to-Capitec withdrawals are free. Use the Capitec app to find the nearest ATM.",
        actionText: "SWITCH",
        btnText: "Find nearest Capitec ATM",
      },
      {
        name: "Buy Vodacom bundles upfront",
        category: "Savings",
        saving: 65,
        detail:
          "Airtime advances cost an 18% fee. A weekly bundle via MyVodacom costs less.",
        actionText: "SWITCH",
        btnText: "Open MyVodacom app",
      },
    ],
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

