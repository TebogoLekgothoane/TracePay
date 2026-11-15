/**
 * Maps a leak "Where it goes" row to the transactions list filter.
 * Categories match backend categorisation names; `q` narrows by description.
 *
 * Monthly account fees and service fees are different. Keyword lists stay
 * exclusive so a monthly package fee never also matches as a service fee.
 */

export type LeakTransactionFilter = {
  /** Exact category name(s). Match if the transaction is in any of them. */
  categories: string[];
  /** Optional description keywords (OR). Empty = whole category. */
  keywords: string[];
  /** Chip / title on the transactions screen. */
  label: string;
};

type ItemFilter = {
  categories: string[];
  keywords?: string[];
  label: string;
};

const FEES: Record<string, ItemFilter> = {
  monthly: {
    categories: ["Bank fees"],
    keywords: [
      "MONTHLY FEE",
      "MONTHLY ACCOUNT",
      "ACCOUNT FEE",
      "ACC FEE",
      "MAINTENANCE FEE",
      "MANAGEMENT FEE",
      "SERVICE FEE MONTHLY",
      "MONTHLY SERVICE",
    ],
    label: "Monthly account fees",
  },
  service: {
    categories: ["Bank fees"],
    // Not monthly package fees — those are under `monthly`.
    keywords: [
      "SERVICE FEE",
      "SERVICE CHARGE",
      "ADMIN FEE",
      "ADMINISTRATION FEE",
      "TRANSACTION FEE",
      "PAYMENT FEE",
      "IMMEDIATE PAYMENT",
      "BANK CHARGE",
    ],
    label: "Service fees",
  },
  atm: {
    categories: ["Bank fees", "Cash Withdrawal"],
    keywords: [
      "ATM FEE",
      "ATM CHARGE",
      "ATM/SSD",
      "ATM WITHDRAWAL FEE",
      "CASH WITHDRAWAL FEE",
      "CASH WITHDRAWAL CHARGE",
    ],
    label: "ATM fees",
  },
  sms: {
    categories: ["Bank fees"],
    keywords: ["SMS", "NOTIFICATION FEE", "ALERT FEE"],
    label: "SMS notifications",
  },
  other: {
    categories: ["Bank fees"],
    label: "Bank fees",
  },
};

const AIRTIME: Record<string, ItemFilter> = {
  data: {
    categories: ["Airtime & Data"],
    keywords: ["DATA", "BUNDLE"],
    label: "Mobile data",
  },
  airtime: {
    categories: ["Airtime & Data"],
    keywords: ["AIRTIME", "PREPAID", "TOP UP", "TOP-UP"],
    label: "Airtime purchases",
  },
  "out-of-bundle": {
    categories: ["Airtime & Data"],
    keywords: ["OUT OF BUNDLE", "OUT-OF-BUNDLE", "OOB", "EXCESS"],
    label: "Out-of-bundle",
  },
};

const ATM: Record<string, ItemFilter> = {
  "other-bank": {
    categories: ["Cash Withdrawal", "Bank fees"],
    keywords: ["ATM", "OTHER BANK", "FOREIGN ATM", "SASWITCH"],
    label: "Other bank ATMs",
  },
  retail: {
    categories: ["Cash Withdrawal"],
    keywords: ["CASH BACK", "CASHBACK", "TILL", "POS CASH"],
    label: "Retail cash backs",
  },
  balance: {
    categories: ["Bank fees", "Cash Withdrawal"],
    keywords: ["BALANCE ENQUIRY", "BALANCE INQUIRY", "BAL ENQ"],
    label: "Balance enquiries",
  },
};

const BY_LEAK: Record<string, Record<string, ItemFilter>> = {
  fees: FEES,
  airtime: AIRTIME,
  atm: ATM,
};

/** Whole-leak fallback when a specific row has no map (still open real transactions). */
const LEAK_DEFAULT: Record<string, ItemFilter> = {
  fees: { categories: ["Bank fees"], label: "Bank fees" },
  airtime: { categories: ["Airtime & Data"], label: "Airtime & Data" },
  atm: { categories: ["Cash Withdrawal", "Bank fees"], label: "Cash withdrawals" },
};

export function leakLineItemTransactionFilter(
  leakId: string,
  itemId: string,
): LeakTransactionFilter | null {
  const mapped = BY_LEAK[leakId]?.[itemId] ?? LEAK_DEFAULT[leakId];
  if (!mapped) return null;
  return {
    categories: mapped.categories,
    keywords: mapped.keywords ?? [],
    label: mapped.label,
  };
}

export function buildLeakTransactionsHref(leakId: string, itemId: string): string | null {
  const filter = leakLineItemTransactionFilter(leakId, itemId);
  if (!filter) return null;

  const params = new URLSearchParams();
  params.set("categories", filter.categories.join("|"));
  params.set("label", filter.label);
  if (filter.keywords.length > 0) {
    params.set("q", filter.keywords.join("|"));
  }
  return `/transactions-list?${params.toString()}`;
}
