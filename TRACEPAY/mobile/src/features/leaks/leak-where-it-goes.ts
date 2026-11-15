/**
 * Real "Where it goes" totals for a leak category.
 *
 * Monthly account fees and service fees are different charges. Classification
 * is exclusive (first match wins) so a monthly account fee never also counts
 * as a service fee.
 */

import { categoryName } from "../transactions/transaction.row";
import type { TransactionRow } from "../transactions/transaction.types";
import { formatRandAmount } from "../../utils/currency";
import { flowAmount, type PeriodRange } from "../insights/category-breakdown";
import {
  leakLineItemTransactionFilter,
  type LeakTransactionFilter,
} from "./leak-transaction-filters";

export type WhereItGoesIcon =
  | "calendar"
  | "card"
  | "landmark"
  | "message"
  | "layers"
  | "wifi"
  | "phone"
  | "store"
  | "help";

export type WhereItGoesRow = {
  id: string;
  title: string;
  description: string;
  amount: string;
  amountValue: number;
  percent: string;
  percentValue: number;
  icon: WhereItGoesIcon;
  filter: LeakTransactionFilter;
};

type BucketDef = {
  id: string;
  title: string;
  description: string;
  icon: WhereItGoesIcon;
  categories: string[];
  keywords: string[];
};

/** First matching bucket wins — order matters for exclusive fee types. */
const FEE_BUCKETS: readonly BucketDef[] = [
  {
    id: "monthly",
    title: "Monthly account fee",
    description: "Recurring monthly package charge",
    icon: "calendar",
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
  },
  {
    id: "service",
    title: "Service fees",
    description: "Per-payment and admin charges",
    icon: "card",
    categories: ["Bank fees"],
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
  },
  {
    id: "atm",
    title: "ATM fees",
    description: "Cash withdrawal charges",
    icon: "landmark",
    categories: ["Bank fees", "Cash Withdrawal"],
    keywords: [
      "ATM FEE",
      "ATM CHARGE",
      "ATM/SSD",
      "ATM WITHDRAWAL FEE",
      "CASH WITHDRAWAL FEE",
      "CASH WITHDRAWAL CHARGE",
    ],
  },
  {
    id: "sms",
    title: "SMS notifications",
    description: "Transaction alert charges",
    icon: "message",
    categories: ["Bank fees"],
    keywords: ["SMS", "NOTIFICATION FEE", "ALERT FEE"],
  },
  {
    id: "other",
    title: "Other fees",
    description: "Miscellaneous bank charges",
    icon: "layers",
    categories: ["Bank fees"],
    keywords: [],
  },
];

const AIRTIME_BUCKETS: readonly BucketDef[] = [
  {
    id: "data",
    title: "Mobile data",
    description: "Data bundles and top-ups",
    icon: "wifi",
    categories: ["Airtime & Data"],
    keywords: ["DATA", "BUNDLE"],
  },
  {
    id: "airtime",
    title: "Airtime purchases",
    description: "Prepaid airtime top-ups",
    icon: "phone",
    categories: ["Airtime & Data"],
    keywords: ["AIRTIME", "PREPAID", "TOP UP", "TOP-UP"],
  },
  {
    id: "out-of-bundle",
    title: "Out-of-bundle",
    description: "Out-of-bundle data charges",
    icon: "layers",
    categories: ["Airtime & Data"],
    keywords: ["OUT OF BUNDLE", "OUT-OF-BUNDLE", "OOB", "EXCESS"],
  },
];

const ATM_BUCKETS: readonly BucketDef[] = [
  {
    id: "other-bank",
    title: "Other bank ATMs",
    description: "Withdrawals at non-home ATMs",
    icon: "landmark",
    categories: ["Cash Withdrawal", "Bank fees"],
    keywords: ["ATM", "OTHER BANK", "FOREIGN ATM", "SASWITCH"],
  },
  {
    id: "retail",
    title: "Retail cash backs",
    description: "Cash at till points",
    icon: "store",
    categories: ["Cash Withdrawal"],
    keywords: ["CASH BACK", "CASHBACK", "TILL", "POS CASH"],
  },
  {
    id: "balance",
    title: "Balance enquiries",
    description: "Paid balance checks",
    icon: "help",
    categories: ["Bank fees", "Cash Withdrawal"],
    keywords: ["BALANCE ENQUIRY", "BALANCE INQUIRY", "BAL ENQ"],
  },
];

const BUCKETS_BY_LEAK: Record<string, readonly BucketDef[]> = {
  fees: FEE_BUCKETS,
  airtime: AIRTIME_BUCKETS,
  atm: ATM_BUCKETS,
};

function inRange(row: TransactionRow, range: Pick<PeriodRange, "startKey" | "endKey">): boolean {
  const day = row.date.slice(0, 10);
  return day >= range.startKey && day <= range.endKey;
}

function matchesBucket(row: TransactionRow, bucket: BucketDef): boolean {
  const name = categoryName(row);
  if (!bucket.categories.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
    return false;
  }
  if (bucket.keywords.length === 0) return true;
  const description = (row.description ?? "").toUpperCase();
  return bucket.keywords.some((keyword) => description.includes(keyword));
}

/** Exclusive: a row belongs to the first matching bucket only. */
export function rowBelongsToWhereBucket(
  leakId: string,
  bucketId: string,
  row: TransactionRow,
): boolean {
  const buckets = BUCKETS_BY_LEAK[leakId];
  if (!buckets) return false;
  const winner = buckets.find((bucket) => matchesBucket(row, bucket));
  return winner?.id === bucketId;
}

/**
 * Assign each spending row to at most one bucket (first match wins).
 * Returns only buckets with a positive total.
 */
export function buildWhereItGoes(
  leakId: string,
  rows: readonly TransactionRow[],
  range: Pick<PeriodRange, "startKey" | "endKey"> | null,
): WhereItGoesRow[] {
  const buckets = BUCKETS_BY_LEAK[leakId];
  if (!buckets || !range) return [];

  const totals = new Map<string, number>();
  for (const bucket of buckets) totals.set(bucket.id, 0);

  for (const row of rows) {
    if (!inRange(row, range)) continue;
    const amount = flowAmount(row, "Spending");
    if (amount <= 0) continue;
    const bucket = buckets.find((entry) => matchesBucket(row, entry));
    if (!bucket) continue;
    totals.set(bucket.id, (totals.get(bucket.id) ?? 0) + amount);
  }

  const grand = [...totals.values()].reduce((sum, value) => sum + value, 0);
  if (grand <= 0) return [];

  return buckets
    .map((bucket) => {
      const amountValue = totals.get(bucket.id) ?? 0;
      const percentValue = (amountValue / grand) * 100;
      const filter =
        leakLineItemTransactionFilter(leakId, bucket.id) ??
        ({
          categories: bucket.categories,
          keywords: bucket.keywords,
          label: bucket.title,
        } satisfies LeakTransactionFilter);
      return {
        id: bucket.id,
        title: bucket.title,
        description: bucket.description,
        amount: formatRandAmount(amountValue),
        amountValue,
        percent: `${Math.round(percentValue)}%`,
        percentValue,
        icon: bucket.icon,
        filter,
      };
    })
    .filter((row) => row.amountValue > 0);
}

export function whereItGoesHref(leakId: string, row: WhereItGoesRow): string {
  const params = new URLSearchParams();
  params.set("categories", row.filter.categories.join("|"));
  params.set("label", row.filter.label);
  params.set("leakBucket", `${leakId}:${row.id}`);
  if (row.filter.keywords.length > 0) {
    params.set("q", row.filter.keywords.join("|"));
  }
  return `/transactions-list?${params.toString()}`;
}
