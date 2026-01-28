import { AnalysisData, LossCategory, Transaction } from "@/types/navigation";

const generateTransactions = (
  category: string,
  count: number,
  minAmount: number,
  maxAmount: number
): Transaction[] => {
  const merchants: Record<string, string[]> = {
    "Hidden Fees": ["FNB Service Fee", "Capitec Monthly Fee", "Standard Bank Charge", "Absa Fee"],
    "Mashonisa Interest": ["Cash Loan Interest", "Payday Advance Fee", "Quick Cash Interest"],
    "Airtime Drains": ["Vodacom Airtime", "MTN Data Bundle", "Cell C Airtime", "Telkom Mobile"],
    "Subscriptions": ["Netflix SA", "Showmax", "Spotify", "DSTV Now", "YouTube Premium"],
    "Bank Charges": ["ATM Withdrawal Fee", "Card Swipe Fee", "Statement Fee", "SMS Notification"],
    "MoMo Fees": ["MoMo Airtime Purchase", "MoMo Data Bundle", "MoMo Transfer Fee", "MoMo Electricity"],
    "Other": ["Miscellaneous Deduction", "Unknown Fee", "System Charge"],
  };

  const categoryMerchants = merchants[category] || merchants["Other"];

  return Array.from({ length: count }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 30));
    
    return {
      id: `${category}-${i}`,
      date: date.toISOString().split("T")[0],
      merchant: categoryMerchants[Math.floor(Math.random() * categoryMerchants.length)],
      amount: Math.round((Math.random() * (maxAmount - minAmount) + minAmount) * 100) / 100,
      category,
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const mockAnalysisData: AnalysisData = {
  totalLoss: 1847.50,
  monthlyIncome: 8500,
  categories: [
    {
      id: "hidden-fees",
      name: "Hidden Fees",
      nameXhosa: "Iimali Ezifihlakeleyo",
      amount: 430,
      percentage: 5.1,
      severity: "critical",
      transactions: generateTransactions("Hidden Fees", 8, 25, 85),
    },
    {
      id: "mashonisa",
      name: "Mashonisa Interest",
      nameXhosa: "Inzala yeMashonisa",
      amount: 520,
      percentage: 6.1,
      severity: "critical",
      transactions: generateTransactions("Mashonisa Interest", 4, 80, 200),
    },
    {
      id: "airtime",
      name: "Airtime Drains",
      nameXhosa: "Ukuphela kwe-Airtime",
      amount: 320,
      percentage: 3.8,
      severity: "warning",
      transactions: generateTransactions("Airtime Drains", 12, 10, 50),
    },
    {
      id: "subscriptions",
      name: "Subscriptions",
      nameXhosa: "Izabhaliso",
      amount: 289.50,
      percentage: 3.4,
      severity: "warning",
      transactions: generateTransactions("Subscriptions", 5, 29, 99),
    },
    {
      id: "bank-charges",
      name: "Bank Charges",
      nameXhosa: "Iintlawulo zeBhanki",
      amount: 188,
      percentage: 2.2,
      severity: "info",
      transactions: generateTransactions("Bank Charges", 15, 5, 25),
    },
    {
      id: "other",
      name: "Other Losses",
      nameXhosa: "Ezinye Ilahleko",
      amount: 100,
      percentage: 1.2,
      severity: "info",
      transactions: generateTransactions("Other", 3, 20, 50),
    },
  ],
  momoData: {
    totalSpent: 496,
    alternativeCost: 350,
    potentialSavings: 146,
    breakdown: {
      airtime: { momoSpent: 300, alternativeCost: 220 },
      data: { momoSpent: 196, alternativeCost: 130 },
    },
  },
  summary: {
    en: "This month your money went heavily to airtime and MoMo fees. You spent R496 on airtime & data using MoMo. If you bought monthly bundles directly, you could have spent R350 and saved R146. Hidden bank fees also took R430 from your account. Consider freezing unnecessary deductions to take control.",
    xh: "Kule nyanga imali yakho iphume kakhulu kwi-airtime neemali ze-MoMo. Usebenzise i-R496 kwi-airtime ne-data usebenzisa i-MoMo. Ukuba wathenga ii-bundle zenyanga ngqo, ubunokusebenzisa i-R350 uze ugcine i-R146. Iimali zebhanki ezifihlakeleyo zithathe i-R430 kwi-akhawunti yakho. Cinga ngokumisa ukutsalwa okungeyomfuneko ukuze ulawule.",
  },
};

export const mockAnalysisDataWithMomo: AnalysisData = {
  ...mockAnalysisData,
  categories: [
    ...mockAnalysisData.categories,
    {
      id: "momo-fees",
      name: "MoMo Fees",
      nameXhosa: "Iimali ze-MoMo",
      amount: 146,
      percentage: 1.7,
      severity: "warning",
      transactions: generateTransactions("MoMo Fees", 10, 5, 25),
    },
  ],
  totalLoss: 1993.50,
};

export const emptyAnalysisData: AnalysisData = {
  totalLoss: 0,
  monthlyIncome: 8500,
  categories: [],
  summary: {
    en: "Great news! Your finances look healthy this month. Keep up the good work!",
    xh: "Iindaba ezintle! Imali yakho ibonakala iphilile le nyanga. Qhubeka umsebenzi omhle!",
  },
};
