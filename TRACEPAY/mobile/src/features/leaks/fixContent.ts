import type { LucideIcon } from "lucide-react-native";
import {
  Banknote,
  Bell,
  CreditCard,
  FileText,
  Landmark,
  MessageSquare,
  Smartphone,
  Store,
  Wallet,
  Wifi,
} from "lucide-react-native";

import type { ImpactTone } from "../../theme/colors";

export type FixActionItem = {
  id: string;
  title: string;
  potentialSaving: string;
  Icon: LucideIcon;
  hasDetailFlow?: boolean;
};

export type FixSection = {
  title: string;
  actions: FixActionItem[];
};

export type FixFlowContent = {
  title: string;
  savings: string;
  impact: ImpactTone;
  sections: FixSection[];
  progressActions: FixActionItem[];
};

export type AccountOption = {
  id: string;
  name: string;
  mark: string;
  markColor: string;
  monthlyFee: string;
  tags: string[];
  featured?: boolean;
};

export type ComparisonRow = {
  label: string;
  values: [string, string, string];
};

export type GuideStep = {
  id: string;
  title: string;
  description: string;
};

export type ActionDetailContent = {
  title: string;
  subtitle: string;
  savings: string;
  savingsLabel: string;
  whyThisHelps: string;
  recommendedTitle: string;
  accounts?: AccountOption[];
  compareRows?: ComparisonRow[];
  topPick?: { name: string; description: string };
  guideTitle: string;
  guideSubtitle: string;
  steps: GuideStep[];
  successTitle: string;
  successSubtitle: string;
  nextSteps: string[];
  primaryCta: string;
  compareCta: string;
  guideCta: string;
  doneCta: string;
};

const FEES_ACTIONS: FixSection[] = [
  {
    title: "Easy to implement",
    actions: [
      {
        id: "account",
        title: "Switch to a lower-fee account",
        potentialSaving: "R165.00 /month",
        Icon: Wallet,
        hasDetailFlow: true,
      },
      {
        id: "sms",
        title: "Reduce SMS notifications",
        potentialSaving: "R72.00 /month",
        Icon: MessageSquare,
      },
    ],
  },
  {
    title: "Medium effort",
    actions: [
      {
        id: "atm",
        title: "Use free ATM networks",
        potentialSaving: "R154.50 /month",
        Icon: Landmark,
      },
    ],
  },
  {
    title: "Longer term",
    actions: [
      {
        id: "services",
        title: "Review account services",
        potentialSaving: "R248.40 /month",
        Icon: CreditCard,
      },
    ],
  },
];

export const FIX_FLOW_CONTENT: Record<string, FixFlowContent> = {
  fees: {
    title: "How to fix",
    savings: "R712.50",
    impact: "high",
    sections: FEES_ACTIONS,
    progressActions: FEES_ACTIONS.flatMap((section) => section.actions),
  },
  airtime: {
    title: "How to fix",
    savings: "R206.15",
    impact: "lowTeal",
    sections: [
      {
        title: "Easy to implement",
        actions: [
          {
            id: "bundle",
            title: "Switch to a better data bundle",
            potentialSaving: "R99.00 /month",
            Icon: Wifi,
            hasDetailFlow: true,
          },
          {
            id: "alerts",
            title: "Set data usage alerts",
            potentialSaving: "R40.00 /month",
            Icon: Bell,
          },
        ],
      },
      {
        title: "Medium effort",
        actions: [
          {
            id: "wifi",
            title: "Use Wi-Fi where possible",
            potentialSaving: "R67.15 /month",
            Icon: Smartphone,
          },
        ],
      },
    ],
    progressActions: [
      { id: "bundle", title: "Switch to a better data bundle", potentialSaving: "R99.00 /month", Icon: Wifi, hasDetailFlow: true },
      { id: "alerts", title: "Set data usage alerts", potentialSaving: "R40.00 /month", Icon: Bell },
      { id: "wifi", title: "Use Wi-Fi where possible", potentialSaving: "R67.15 /month", Icon: Smartphone },
      { id: "topups", title: "Reduce ad-hoc top-ups", potentialSaving: "R40.00 /month", Icon: Banknote },
    ],
  },
  atm: {
    title: "How to fix",
    savings: "R150.00",
    impact: "lowBlue",
    sections: [
      {
        title: "Easy to implement",
        actions: [
          {
            id: "home-atm",
            title: "Use your bank's ATMs",
            potentialSaving: "R85.00 /month",
            Icon: Landmark,
            hasDetailFlow: true,
          },
          {
            id: "balance",
            title: "Skip paid balance checks",
            potentialSaving: "R30.00 /month",
            Icon: MessageSquare,
          },
        ],
      },
      {
        title: "Medium effort",
        actions: [
          {
            id: "cashback",
            title: "Get cash back at stores",
            potentialSaving: "R35.00 /month",
            Icon: Store,
          },
        ],
      },
    ],
    progressActions: [
      { id: "home-atm", title: "Use your bank's ATMs", potentialSaving: "R85.00 /month", Icon: Landmark, hasDetailFlow: true },
      { id: "balance", title: "Skip paid balance checks", potentialSaving: "R30.00 /month", Icon: MessageSquare },
      { id: "cashback", title: "Get cash back at stores", potentialSaving: "R35.00 /month", Icon: Store },
      { id: "card", title: "Pay by card instead", potentialSaving: "R30.00 /month", Icon: CreditCard },
    ],
  },
};

export const ACTION_DETAILS: Record<string, ActionDetailContent> = {
  account: {
    title: "Switch to a lower-fee account",
    subtitle: "You could save R165 every month by moving to an account with lower fees.",
    savings: "R165.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Many people stay on legacy accounts with monthly fees they no longer need. A low-fee or zero-fee account can cut recurring charges without changing how you bank day to day.",
    recommendedTitle: "Recommended accounts",
    accounts: [
      {
        id: "nedbank",
        name: "Nedbank Savvy Plus",
        mark: "N",
        markColor: "success",
        monthlyFee: "R0.00",
        tags: ["Free card", "Low fees"],
        featured: true,
      },
      {
        id: "capitec",
        name: "Capitec Global One",
        mark: "C",
        markColor: "primary",
        monthlyFee: "R0.00",
        tags: ["Simple pricing", "No monthly fee"],
      },
      {
        id: "tyme",
        name: "TymeBank EveryDay",
        mark: "T",
        markColor: "warning",
        monthlyFee: "R0.00",
        tags: ["Digital first", "Free card"],
      },
    ],
    compareRows: [
      { label: "Monthly fee", values: ["R0.00", "R0.00", "R0.00"] },
      { label: "Card", values: ["Free", "Free", "Free"] },
      { label: "ATM withdrawals", values: ["Free at Nedbank", "Low cost", "Free at TymeBank"] },
      { label: "Online banking", values: ["Included", "Included", "Included"] },
      { label: "Debit orders", values: ["Free", "Free", "Free"] },
    ],
    topPick: {
      name: "Nedbank Savvy Plus",
      description: "Best match for your spending pattern and lowest overall fees.",
    },
    guideTitle: "How to switch",
    guideSubtitle: "Follow these steps to move to a lower-fee account.",
    steps: [
      { id: "1", title: "Open your new account", description: "Apply online in a few minutes." },
      { id: "2", title: "Verify your identity", description: "Upload your ID and proof of address." },
      { id: "3", title: "Move your debit orders", description: "Switch recurring payments to the new account." },
      { id: "4", title: "Update your salary deposit", description: "Give your employer the new account details." },
      { id: "5", title: "Close your old account", description: "Once everything is moved, close the old one." },
    ],
    successTitle: "Great choice!",
    successSubtitle: "You're on your way to saving R165.00 every month.",
    nextSteps: [
      "We'll remind you to move debit orders",
      "Track your progress in the app",
      "See savings add up on your dashboard",
    ],
    primaryCta: "Compare accounts",
    compareCta: "Open account",
    guideCta: "Open my new account",
    doneCta: "Done",
  },
  bundle: {
    title: "Switch to a better data bundle",
    subtitle: "You could save R99 every month by matching your bundle to actual usage.",
    savings: "R99.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Buying the wrong bundle — or topping up too often — adds up quickly. A bundle that fits your usage avoids out-of-bundle charges and impulse top-ups.",
    recommendedTitle: "Recommended bundles",
    accounts: [
      {
        id: "vodacom",
        name: "Vodacom 10GB",
        mark: "V",
        markColor: "destructive",
        monthlyFee: "R149.00",
        tags: ["Best value", "Rollover data"],
        featured: true,
      },
      {
        id: "mtn",
        name: "MTN 8GB",
        mark: "M",
        markColor: "warning",
        monthlyFee: "R139.00",
        tags: ["Night data", "Social bundles"],
      },
      {
        id: "cellc",
        name: "Cell C 6GB",
        mark: "C",
        markColor: "primary",
        monthlyFee: "R129.00",
        tags: ["Lower cost", "Flexible"],
      },
    ],
    compareRows: [
      { label: "Monthly cost", values: ["R149.00", "R139.00", "R129.00"] },
      { label: "Data included", values: ["10GB", "8GB", "6GB"] },
      { label: "Night data", values: ["Unlimited", "5GB", "None"] },
      { label: "Rollover", values: ["Yes", "Yes", "No"] },
    ],
    topPick: {
      name: "Vodacom 10GB",
      description: "Best fit for your current usage and lowest risk of out-of-bundle charges.",
    },
    guideTitle: "How to switch bundles",
    guideSubtitle: "A quick checklist to move to a better data plan.",
    steps: [
      { id: "1", title: "Check your usage", description: "Review the last 3 months in TracePay." },
      { id: "2", title: "Pick the right bundle", description: "Choose a plan that covers your average use." },
      { id: "3", title: "Activate the new bundle", description: "Switch via your network app or USSD." },
      { id: "4", title: "Turn on data alerts", description: "Get warned before you overspend." },
    ],
    successTitle: "Smart move!",
    successSubtitle: "You're on your way to saving R99.00 every month on data.",
    nextSteps: [
      "We'll track your data spending",
      "Alert you before out-of-bundle charges",
      "Suggest better bundles over time",
    ],
    primaryCta: "Compare bundles",
    compareCta: "Switch bundle",
    guideCta: "Activate bundle",
    doneCta: "Done",
  },
  "home-atm": {
    title: "Use your bank's ATMs",
    subtitle: "You could save R85 every month by avoiding other bank ATM fees.",
    savings: "R85.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Withdrawing at another bank's ATM often costs R8–R15 per withdrawal. Using your home bank's network — or getting cash back at a store — keeps more money in your pocket.",
    recommendedTitle: "Free ATM options near you",
    accounts: [
      {
        id: "nedbank",
        name: "Nedbank ATM · Sandton City",
        mark: "N",
        markColor: "success",
        monthlyFee: "Free",
        tags: ["0.4 km away", "No fee"],
        featured: true,
      },
      {
        id: "capitec",
        name: "Capitec ATM · Rosebank",
        mark: "C",
        markColor: "primary",
        monthlyFee: "Free",
        tags: ["1.2 km away", "Partner network"],
      },
    ],
    guideTitle: "How to avoid ATM fees",
    guideSubtitle: "Simple habits that cut withdrawal costs.",
    steps: [
      { id: "1", title: "Find free ATMs nearby", description: "Use the map in your banking app." },
      { id: "2", title: "Plan cash withdrawals", description: "Withdraw less often, in larger amounts." },
      { id: "3", title: "Try cash back at stores", description: "Often cheaper than non-bank ATMs." },
      { id: "4", title: "Pay by card where possible", description: "Reduce how much cash you need." },
    ],
    successTitle: "Nice work!",
    successSubtitle: "You're on your way to saving R85.00 every month on ATM fees.",
    nextSteps: [
      "We'll show free ATMs near you",
      "Alert you about costly withdrawals",
      "Track your fee savings",
    ],
    primaryCta: "Find free ATMs",
    compareCta: "View on map",
    guideCta: "Find nearest ATM",
    doneCta: "Done",
  },
};

export function getFixContent(leakId: string): FixFlowContent {
  return FIX_FLOW_CONTENT[leakId] ?? FIX_FLOW_CONTENT.fees;
}

export function getActionDetail(actionId: string): ActionDetailContent | null {
  return ACTION_DETAILS[actionId] ?? null;
}

export function getCompletedActions(leakId: string): string[] {
  if (leakId === "fees") return ["account"];
  if (leakId === "airtime") return [];
  if (leakId === "atm") return [];
  return [];
}
