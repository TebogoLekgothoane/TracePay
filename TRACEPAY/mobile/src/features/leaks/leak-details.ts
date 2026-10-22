import type { LucideIcon } from "lucide-react-native";
import {
  Banknote,
  Calendar,
  CreditCard,
  FileText,
  HelpCircle,
  Landmark,
  Layers,
  MessageSquare,
  RefreshCw,
  Smartphone,
  Store,
  Wifi,
} from "lucide-react-native";

import type { ImpactTone } from "../../theme/colors";
import { getFixRoute, type FixSection } from "./fixContent";

export type BreakdownItem = {
  id: string;
  title: string;
  description: string;
  amount: string;
  percent: string;
  Icon: LucideIcon;
};

export type FeeTransaction = {
  id: string;
  date: string;
  description: string;
  amount: string;
};

export type SubscriptionItem = {
  id: string;
  name: string;
  category: string;
  billing: string;
  amount: string;
  status: "Active" | "Inactive";
  /** Simple Icons brand id and/or Hunter domain for logo lookup. */
  brandId?: string;
  logoDomain?: string;
  mark: string;
  markColor: string;
};

export type LeakDetail = {
  title: string;
  subtitle: string;
  HeaderIcon: LucideIcon;
  impact: ImpactTone;
  amount: string;
  onLabel: string;
  changeLabel: string;
  percentOfLeaks: string;
  variant: "breakdown" | "subscriptions";
  listSectionTitle?: string;
  breakdown?: BreakdownItem[];
  didYouKnow?: string;
  subscriptions?: SubscriptionItem[];
  ctaTitle: string;
  ctaSubtitle: string;
  ctaButton: string;
};

export const LEAK_DETAILS: Record<string, LeakDetail> = {
  fees: {
    title: "Bank fees",
    subtitle: "Unnecessary bank charges",
    HeaderIcon: FileText,
    impact: "high",
    amount: "R712.50",
    onLabel: "on bank fees",
    changeLabel: "↑ 18% vs last month",
    percentOfLeaks: "39%",
    variant: "breakdown",
    breakdown: [
      {
        id: "monthly",
        title: "Monthly account fee",
        description: "Recurring monthly charge",
        amount: "R165.00",
        percent: "23%",
        Icon: Calendar,
      },
      {
        id: "service",
        title: "Service fees",
        description: "General account charges",
        amount: "R248.40",
        percent: "35%",
        Icon: CreditCard,
      },
      {
        id: "atm",
        title: "ATM fees",
        description: "Cash withdrawals",
        amount: "R154.50",
        percent: "22%",
        Icon: Landmark,
      },
      {
        id: "sms",
        title: "SMS notifications",
        description: "Transaction alerts",
        amount: "R72.00",
        percent: "10%",
        Icon: MessageSquare,
      },
      {
        id: "other",
        title: "Other fees",
        description: "Miscellaneous charges",
        amount: "R72.60",
        percent: "10%",
        Icon: Layers,
      },
    ],
    didYouKnow:
      "You could save up to R712.50 this month by cutting unnecessary bank charges.",
    ctaTitle: "Stop these bank fees",
    ctaSubtitle: "Open the first step-by-step guide",
    ctaButton: "Start fixing",
  },
  subs: {
    title: "Subscriptions",
    subtitle: "Unused or forgotten subscriptions",
    HeaderIcon: RefreshCw,
    impact: "mediumWarm",
    amount: "R430.00",
    onLabel: "on subscriptions",
    changeLabel: "↓ 8% vs last month",
    percentOfLeaks: "24%",
    variant: "subscriptions",
    subscriptions: [
      {
        id: "netflix",
        name: "Netflix",
        category: "Entertainment",
        billing: "Billed monthly",
        amount: "R159.00",
        status: "Active",
        brandId: "netflix",
        logoDomain: "netflix.com",
        mark: "N",
        markColor: "destructive",
      },
      {
        id: "showmax",
        name: "Showmax",
        category: "Entertainment",
        billing: "Billed monthly",
        amount: "R99.00",
        status: "Active",
        logoDomain: "showmax.com",
        mark: "S",
        markColor: "primary",
      },
      {
        id: "spotify",
        name: "Spotify Premium",
        category: "Music",
        billing: "Billed monthly",
        amount: "R69.00",
        status: "Active",
        brandId: "spotify",
        logoDomain: "spotify.com",
        mark: "♪",
        markColor: "success",
      },
      {
        id: "youtube",
        name: "YouTube Premium",
        category: "Music",
        billing: "Billed monthly",
        amount: "R72.00",
        status: "Active",
        brandId: "youtube",
        logoDomain: "youtube.com",
        mark: "▶",
        markColor: "destructive",
      },
      {
        id: "adobe",
        name: "Adobe Acrobat",
        category: "Productivity",
        billing: "Billed yearly",
        amount: "R519.00",
        status: "Inactive",
        logoDomain: "adobe.com",
        mark: "A",
        markColor: "destructive",
      },
      {
        id: "canva",
        name: "Canva Pro",
        category: "Design",
        billing: "Billed yearly",
        amount: "R599.00",
        status: "Inactive",
        logoDomain: "canva.com",
        mark: "C",
        markColor: "secondary",
      },
    ],
    ctaTitle: "Cancel what you don't use",
    ctaSubtitle: "Open step-by-step cancel guides",
    ctaButton: "Start cancelling",
  },
  debit: {
    title: "Debit orders",
    subtitle: "Could be paused or cancelled",
    HeaderIcon: Calendar,
    impact: "mediumCool",
    amount: "R320.75",
    onLabel: "on debit orders",
    changeLabel: "↑ 5% vs last month",
    percentOfLeaks: "18%",
    variant: "subscriptions",
    listSectionTitle: "Your debit orders",
    subscriptions: [
      {
        id: "dstv",
        name: "DSTV Premium",
        category: "Entertainment",
        billing: "Billed monthly",
        amount: "R899.00",
        status: "Active",
        logoDomain: "dstv.com",
        mark: "D",
        markColor: "primary",
      },
      {
        id: "gym",
        name: "Gym membership",
        category: "Health",
        billing: "Billed monthly",
        amount: "R450.00",
        status: "Active",
        mark: "G",
        markColor: "success",
      },
      {
        id: "insurance",
        name: "Insurance premium",
        category: "Insurance",
        billing: "Billed monthly",
        amount: "R320.75",
        status: "Active",
        mark: "I",
        markColor: "secondary",
      },
    ],
    ctaTitle: "Stop unused debit orders",
    ctaSubtitle: "Open step-by-step pause guides",
    ctaButton: "Start pausing",
  },
  airtime: {
    title: "Airtime & data",
    subtitle: "Higher than usual spending",
    HeaderIcon: Banknote,
    impact: "lowTeal",
    amount: "R206.15",
    onLabel: "on airtime & data",
    changeLabel: "↑ 12% vs last month",
    percentOfLeaks: "11%",
    variant: "breakdown",
    breakdown: [
      {
        id: "data",
        title: "Mobile data",
        description: "Monthly bundles & top-ups",
        amount: "R99.00",
        percent: "48%",
        Icon: Wifi,
      },
      {
        id: "airtime",
        title: "Airtime purchases",
        description: "Prepaid top-ups",
        amount: "R67.15",
        percent: "33%",
        Icon: Smartphone,
      },
      {
        id: "out-of-bundle",
        title: "Out-of-bundle",
        description: "Extra data usage charges",
        amount: "R40.00",
        percent: "19%",
        Icon: Layers,
      },
    ],
    didYouKnow:
      "You could save up to R206.15 by matching your bundle to real usage and avoiding out-of-bundle charges.",
    ctaTitle: "Cut airtime & data costs",
    ctaSubtitle: "Open the first step-by-step guide",
    ctaButton: "Start fixing",
  },
  atm: {
    title: "Cash withdrawals",
    subtitle: "High ATM fees",
    HeaderIcon: Landmark,
    impact: "lowBlue",
    amount: "R150.00",
    onLabel: "on cash withdrawals",
    changeLabel: "↑ 22% vs last month",
    percentOfLeaks: "8%",
    variant: "breakdown",
    breakdown: [
      {
        id: "other-bank",
        title: "Other bank ATMs",
        description: "Withdrawals at non-home ATMs",
        amount: "R85.00",
        percent: "57%",
        Icon: Landmark,
      },
      {
        id: "retail",
        title: "Retail cash backs",
        description: "Cash at till points",
        amount: "R35.00",
        percent: "23%",
        Icon: Store,
      },
      {
        id: "balance",
        title: "Balance enquiries",
        description: "Paid balance checks",
        amount: "R30.00",
        percent: "20%",
        Icon: HelpCircle,
      },
    ],
    didYouKnow:
      "You could save up to R150.00 by using your bank's ATMs and skipping paid balance enquiries.",
    ctaTitle: "Reduce withdrawal fees",
    ctaSubtitle: "Open the first step-by-step guide",
    ctaButton: "Start fixing",
  },
};

/** Map a breakdown line item to that leak's fix action (never cross-leak). */
export const BREAKDOWN_FIX_ACTION: Record<string, Record<string, string>> = {
  fees: {
    monthly: "account",
    service: "services",
    atm: "atm",
    sms: "sms",
    other: "services",
  },
  airtime: {
    data: "bundle",
    airtime: "topups",
    "out-of-bundle": "data-alerts",
  },
  atm: {
    "other-bank": "home-atm",
    retail: "cashback",
    balance: "balance",
  },
};

export const FEE_TRANSACTIONS: Record<string, FeeTransaction[]> = {
  monthly: [
    { id: "account-1", date: "20 May", description: "Monthly account fee", amount: "165.00" },
  ],
  service: [
    { id: "service-1", date: "04 May", description: "Immediate payment fee", amount: "25.00" },
    { id: "service-2", date: "11 May", description: "Cash deposit fee", amount: "48.40" },
    { id: "service-3", date: "27 May", description: "Payment service fee", amount: "175.00" },
  ],
  atm: [
    { id: "atm-1", date: "06 May", description: "Other-bank ATM fee", amount: "85.00" },
    { id: "atm-2", date: "19 May", description: "Other-bank ATM fee", amount: "69.50" },
  ],
  sms: [
    { id: "sms-1", date: "03 May", description: "SMS notification fee", amount: "24.00" },
    { id: "sms-2", date: "14 May", description: "SMS notification fee", amount: "24.00" },
    { id: "sms-3", date: "25 May", description: "SMS notification fee", amount: "24.00" },
  ],
  other: [
    { id: "other-1", date: "09 May", description: "Balance enquiry fee", amount: "30.00" },
    { id: "other-2", date: "22 May", description: "Card replacement fee", amount: "42.60" },
  ],
  data: [
    { id: "data-1", date: "05 May", description: "Mobile data bundle", amount: "99.00" },
    { id: "data-2", date: "18 May", description: "Mobile data top-up", amount: "75.00" },
  ],
  airtime: [
    { id: "airtime-1", date: "07 May", description: "Airtime top-up", amount: "35.00" },
    { id: "airtime-2", date: "16 May", description: "Airtime top-up", amount: "32.15" },
  ],
  "out-of-bundle": [
    { id: "oob-1", date: "28 May", description: "Out-of-bundle data charge", amount: "40.00" },
  ],
  "other-bank": [
    { id: "other-atm-1", date: "06 May", description: "Other-bank ATM withdrawal fee", amount: "85.00" },
  ],
  retail: [
    { id: "retail-1", date: "13 May", description: "Retail cash-back fee", amount: "35.00" },
  ],
  balance: [
    { id: "balance-1", date: "22 May", description: "Paid balance enquiry", amount: "30.00" },
  ],
  dstv: [
    { id: "dstv-1", date: "01 May", description: "DSTV Premium debit order", amount: "899.00" },
    { id: "dstv-2", date: "01 Apr", description: "DSTV Premium debit order", amount: "899.00" },
  ],
  gym: [
    { id: "gym-1", date: "03 May", description: "Gym membership debit order", amount: "450.00" },
    { id: "gym-2", date: "03 Apr", description: "Gym membership debit order", amount: "450.00" },
  ],
  insurance: [
    { id: "insurance-1", date: "15 May", description: "Insurance premium debit order", amount: "320.75" },
    { id: "insurance-2", date: "15 Apr", description: "Insurance premium debit order", amount: "320.75" },
  ],
};

export type LeakLineItem = {
  leakId: string;
  itemId: string;
  leakTitle: string;
  title: string;
  description: string;
  amount: string;
  percent?: string;
  impact: ImpactTone;
  Icon: LucideIcon;
  transactions: FeeTransaction[];
  mitigation: string;
  fixRoute: string | null;
};

/** Resolve one "Where it comes from" or debit-order row to its transactions and fix route. */
export function getLeakLineItem(leakId: string, itemId: string): LeakLineItem | null {
  const detail = LEAK_DETAILS[leakId];
  if (!detail) return null;

  const breakdown = detail.breakdown?.find((item) => item.id === itemId);
  const subscription = detail.subscriptions?.find((item) => item.id === itemId);
  if (!breakdown && !subscription) return null;

  const actionId = BREAKDOWN_FIX_ACTION[leakId]?.[itemId];
  const fixRoute = actionId
    ? getFixRoute(leakId, actionId)
    : leakId === "debit"
      ? getFixRoute(leakId, `pause-${itemId}`)
      : null;

  return {
    leakId,
    itemId,
    leakTitle: detail.title,
    title: breakdown?.title ?? subscription?.name ?? "",
    description: breakdown
      ? breakdown.description
      : `${subscription?.category} · ${subscription?.billing}`,
    amount: breakdown?.amount ?? subscription?.amount ?? "R0.00",
    percent: breakdown?.percent,
    impact: detail.impact,
    Icon: breakdown?.Icon ?? detail.HeaderIcon,
    transactions: FEE_TRANSACTIONS[itemId] ?? [],
    mitigation:
      leakId === "debit"
        ? "Confirm whether this debit order is still needed, then pause or cancel it with the provider if appropriate."
        : "Review the entries, then open the relevant guide to reduce or avoid similar charges.",
    fixRoute,
  };
}

/** Leaks whose detail screen is a filterable transactions list. */
export const TRANSACTION_LIST_LEAKS = ["fees", "debit", "airtime"] as const;

export function hasTransactionList(leakId: string): boolean {
  return (TRANSACTION_LIST_LEAKS as readonly string[]).includes(leakId);
}

export type TransactionFilter = { id: string; label: string };

const FILTER_LABELS: Record<string, Record<string, string>> = {
  fees: {
    monthly: "Monthly account fees",
    service: "Service fees",
    atm: "ATM fees",
    sms: "SMS notifications",
    other: "Other fees",
  },
};

const ALL_LABELS: Record<string, string> = {
  fees: "All fees",
  debit: "All debit orders",
  airtime: "All",
};

/** Filter chips for a leak: "all" plus one per breakdown line or debit order. */
export function listTransactionFilters(leakId: string): TransactionFilter[] {
  const detail = LEAK_DETAILS[leakId];
  if (!detail) return [];
  const items =
    detail.breakdown?.map((item) => ({ id: item.id, title: item.title })) ??
    detail.subscriptions?.map((item) => ({ id: item.id, title: item.name })) ??
    [];
  return [
    { id: "all", label: ALL_LABELS[leakId] ?? "All" },
    ...items.map((item) => ({
      id: item.id,
      label: FILTER_LABELS[leakId]?.[item.id] ?? item.title,
    })),
  ];
}

export type CategorisedTransaction = FeeTransaction & {
  categoryId: string;
  categoryTitle: string;
  Icon: LucideIcon;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateSortKey(date: string): number {
  const [day, month] = date.split(" ");
  return MONTHS.indexOf(month ?? "") * 100 + Number(day);
}

/** A leak's transactions for one filter (or "all"), newest first. */
export function listLeakTransactions(leakId: string, filter: string): CategorisedTransaction[] {
  const detail = LEAK_DETAILS[leakId];
  if (!detail) return [];
  const items =
    detail.breakdown?.map((item) => ({ id: item.id, title: item.title, Icon: item.Icon })) ??
    detail.subscriptions?.map((item) => ({
      id: item.id,
      title: item.name,
      Icon: detail.HeaderIcon,
    })) ??
    [];
  return items
    .filter((item) => filter === "all" || item.id === filter)
    .flatMap((item) =>
      (FEE_TRANSACTIONS[item.id] ?? []).map((transaction) => ({
        ...transaction,
        categoryId: item.id,
        categoryTitle: item.title,
        Icon: item.Icon,
      })),
    )
    .sort((a, b) => dateSortKey(b.date) - dateSortKey(a.date));
}

/** Fix actions shown per filter; falls back to BREAKDOWN_FIX_ACTION. */
const FILTER_FIX_ACTIONS: Record<string, Record<string, string[]>> = {
  airtime: {
    data: ["bundle", "wifi"],
    airtime: ["topups"],
    "out-of-bundle": ["data-alerts", "bundle"],
  },
};

/** "How to stop this" sections narrowed to what the selected filter is about. */
export function filterFixSections(
  leakId: string,
  filter: string,
  sections: FixSection[],
): FixSection[] {
  if (filter === "all") return sections;

  if (leakId === "debit") {
    const order = LEAK_DETAILS.debit.subscriptions?.find((item) => item.id === filter);
    if (!order) return sections;
    return [
      {
        title: "Easy to implement",
        actions: [
          {
            id: `pause-${order.id}`,
            title: `Pause or cancel ${order.name}`,
            potentialSaving: `${order.amount} /month`,
            Icon: LEAK_DETAILS.debit.HeaderIcon,
            hasDetailFlow: true,
          },
        ],
      },
      ...sections.filter((section) => section.actions.every((action) => action.id !== "pause")),
    ];
  }

  const single = BREAKDOWN_FIX_ACTION[leakId]?.[filter];
  const actionIds = FILTER_FIX_ACTIONS[leakId]?.[filter] ?? (single ? [single] : []);
  return sections
    .map((section) => ({
      ...section,
      actions: section.actions.filter((action) => actionIds.includes(action.id)),
    }))
    .filter((section) => section.actions.length > 0);
}
