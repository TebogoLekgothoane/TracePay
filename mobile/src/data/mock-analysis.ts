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

/** Aligned to app demo total (DEMO_BANKS sum = 2219.7) */
const MOCK_TOTAL_LOSS = 2219.7;

export const mockAnalysisData: AnalysisData = {
  totalLoss: MOCK_TOTAL_LOSS - 471.7,
  monthlyIncome: 8500,
  categories: [
    { id: "hidden-fees", name: "Hidden Fees", nameXhosa: "Iimali Ezifihlakeleyo", amount: 387, percentage: 4.5, severity: "critical", transactions: generateTransactions("Hidden Fees", 8, 8, 28) },
    { id: "mashonisa", name: "Mashonisa Interest", nameXhosa: "Inzala yeMashonisa", amount: 603, percentage: 7.1, severity: "critical", transactions: generateTransactions("Mashonisa Interest", 4, 25, 65) },
    { id: "airtime", name: "Airtime Drains", nameXhosa: "Ukuphela kwe-Airtime", amount: 278, percentage: 3.3, severity: "warning", transactions: generateTransactions("Airtime Drains", 12, 5, 18) },
    { id: "subscriptions", name: "Subscriptions", nameXhosa: "Izabhaliso", amount: 240, percentage: 2.8, severity: "warning", transactions: generateTransactions("Subscriptions", 5, 12, 35) },
    { id: "bank-charges", name: "Bank Charges", nameXhosa: "Iintlawulo zeBhanki", amount: 163, percentage: 1.9, severity: "info", transactions: generateTransactions("Bank Charges", 15, 2, 10) },
    { id: "other", name: "Other Losses", nameXhosa: "Ezinye Ilahleko", amount: 77, percentage: 0.9, severity: "info", transactions: generateTransactions("Other", 3, 8, 18) },
  ],
  momoData: {
    totalSpent: 496,
    alternativeCost: 350,
    potentialSavings: 146,
    breakdown: { airtime: { momoSpent: 280, alternativeCost: 200 }, data: { momoSpent: 216, alternativeCost: 150 } },
  },
  summary: {
    en: "This month you lost R2,220. Airtime and MoMo fees, bank fees, subscriptions and debit orders are the main leaks. Switch to monthly data bundles to save on telco spend.",
    xh: "Kule nyanga ulahlekelwe yi-R2,220. I-airtime neemali ze-MoMo, iimali zebhanki, izabhaliso nee-debit order yimithombo eyintloko. Tshintsha kwi-data bundles zenyanga ukuze ugcine kwi-telco.",
  },
};

export const mockAnalysisDataWithMomo: AnalysisData = {
  ...mockAnalysisData,
  categories: [
    ...mockAnalysisData.categories,
    { id: "momo-fees", name: "MoMo Fees", nameXhosa: "Iimali ze-MoMo", amount: 471.7, percentage: 5.5, severity: "warning", transactions: generateTransactions("MoMo Fees", 10, 2, 10) },
  ],
  totalLoss: MOCK_TOTAL_LOSS,
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
