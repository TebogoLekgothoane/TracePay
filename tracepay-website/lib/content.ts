import {
  Activity,
  Coins,
  Copy,
  Receipt,
  Repeat,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export const SITE = {
  name: "TracePay",
  url: "https://tracepay.co.za",
  domain: "tracepay.co.za",
  email: "hello@tracepay.co.za",
  title: "TracePay | Financial Intelligence",
  description:
    "TracePay helps you examine financial transactions, uncover potential money leaks and understand recurring charges, fees and spending patterns.",
  tagline: "Your money leaves clues. We find them.",
} as const;

export const NAV_LINKS = [
  { label: "How it works", href: "/how-it-works" },
  { label: "What we detect", href: "/what-we-detect" },
  { label: "Security", href: "/security" },
  { label: "About", href: "/about" },
] as const;

export const BANKS: readonly string[] = [
  "Capitec",
  "FNB",
  "Discovery Bank",
  "Absa",
  "African Bank",
  "Investec",
  "Nedbank",
  "Standard Bank",
  "TymeBank",
];

/* ---------- Hero transaction preview (illustrative sample data) ---------- */

export type LedgerRow = {
  date: string;
  merchant: string;
  amount: string;
  chip?: string;
};

export type LedgerEntry = {
  rows: readonly LedgerRow[];
  /** Index into HERO_INSIGHTS when this entry can be investigated. */
  insight?: number;
};

export const LEDGER: readonly LedgerEntry[] = [
  { rows: [{ date: "12 Oct", merchant: "Grocery store", amount: "R642.18" }] },
  {
    insight: 0,
    rows: [{ date: "13 Oct", merchant: "Video streaming", amount: "R159.00", chip: "Repeats monthly" }],
  },
  { rows: [{ date: "14 Oct", merchant: "Ride hailing", amount: "R86.50" }] },
  {
    insight: 1,
    rows: [
      { date: "15 Oct", merchant: "Online retailer", amount: "R210.00" },
      { date: "15 Oct", merchant: "Online retailer", amount: "R210.00", chip: "Potential duplicate" },
    ],
  },
  { rows: [{ date: "17 Oct", merchant: "Cash withdrawal", amount: "R500.00" }] },
  {
    insight: 2,
    rows: [{ date: "18 Oct", merchant: "Monthly account fee", amount: "R145.00", chip: "Banking fee" }],
  },
  { rows: [{ date: "19 Oct", merchant: "Pharmacy", amount: "R188.40" }] },
];

export type Insight = {
  kicker: string;
  title: string;
  body: string;
  review: string;
};

export const HERO_INSIGHTS: readonly Insight[] = [
  {
    kicker: "RECURRING PAYMENT",
    title: "Video streaming repeats every month",
    body: "The same amount of R159.00 has been charged around the same date each month in this sample.",
    review: "Worth reviewing: whether you still want this subscription.",
  },
  {
    kicker: "POTENTIAL DUPLICATE",
    title: "Two identical payments on 15 Oct",
    body: "Two payments of R210.00 went to the same merchant on the same day. This may be two genuine purchases, or a repeat charge.",
    review: "Worth reviewing: whether you made both purchases.",
  },
  {
    kicker: "BANKING FEE",
    title: "This month’s account fee is higher",
    body: "The monthly account fee was R99.00 in earlier months in this sample, and R145.00 this month.",
    review: "Worth reviewing: your account’s fee schedule.",
  },
];

/* ---------- Problem section ---------- */

export const FRAGMENTS: readonly { label: string; value: string; text: string }[] = [
  { label: "Music streaming", value: "R59.00 → R69.00", text: "A subscription that quietly increases in price." },
  { label: "Online retailer · 15 Oct", value: "R210.00 × 2", text: "The same payment appearing twice." },
  { label: "Account fee", value: "R12.50 × 9", text: "Small recurring fees that go unnoticed." },
  { label: "PAYM*8841 JHB 0392", value: "R74.00", text: "Charges that are hard to recognise on a bank statement." },
];

/* ---------- How it works ---------- */

export const STAGES: readonly { title: string; text: string }[] = [
  {
    title: "Examine your transactions",
    text: "You choose a supported bank and import a PDF statement. TracePay only analyses the transaction data you consent to share, and only from the banks it supports.",
  },
  {
    title: "Identify meaningful patterns",
    text: "Payments are grouped and compared, so recurring payments, fees, possible duplicates and other supported patterns can be picked out.",
  },
  {
    title: "Understand what deserves attention",
    text: "Each finding comes with a plain explanation of what was noticed and why it may matter, linked to the transactions behind it.",
  },
];

/* ---------- What TracePay can uncover ---------- */

export type Category = {
  title: string;
  text: string;
  icon: LucideIcon;
  rows: readonly { label: string; value: string; highlight?: boolean }[];
  review: string;
};

export const CATEGORIES: readonly Category[] = [
  {
    title: "Recurring payments",
    text: "Repeated charges and recurring payment patterns, with the date the next one is expected.",
    icon: Repeat,
    rows: [
      { label: "Video streaming · 15 Sep", value: "R159.00" },
      { label: "Video streaming · 15 Oct", value: "R159.00", highlight: true },
      { label: "Next expected", value: "15 Nov" },
    ],
    review: "whether you still want it.",
  },
  {
    title: "Subscription price changes",
    text: "A change in the amount charged by a recurring merchant, when there is enough history to compare.",
    icon: TrendingUp,
    rows: [
      { label: "Music streaming · Aug", value: "R59.00" },
      { label: "Music streaming · Sep", value: "R69.00", highlight: true },
      { label: "Change", value: "+R10.00" },
    ],
    review: "the merchant’s notice of the price change.",
  },
  {
    title: "Duplicate payments",
    text: "Payments that look like repeats, flagged as potential duplicates for you to investigate.",
    icon: Copy,
    rows: [
      { label: "Online retailer · 15 Oct", value: "R210.00", highlight: true },
      { label: "Online retailer · 15 Oct", value: "R210.00", highlight: true },
    ],
    review: "whether both were purchases you made.",
  },
  {
    title: "Banking fees",
    text: "Transaction charges and repeated bank fees, so you can see what they add up to.",
    icon: Receipt,
    rows: [
      { label: "Monthly account fee · Sep", value: "R99.00" },
      { label: "Monthly account fee · Oct", value: "R145.00", highlight: true },
      { label: "Withdrawal fee × 3", value: "R37.50" },
    ],
    review: "your account’s fee schedule.",
  },
  {
    title: "Spending patterns",
    text: "Repeated small purchases and airtime spending that add up over a week or a month.",
    icon: Coins,
    rows: [
      { label: "Airtime · 6 purchases", value: "R240.00" },
      { label: "Purchases under R50 · 7 days", value: "18", highlight: true },
    ],
    review: "what these small purchases total together.",
  },
  {
    title: "Unusual transactions",
    text: "Activity that differs from your usual pattern, where the available data supports it.",
    icon: Activity,
    rows: [
      { label: "Usual range · this category", value: "R50–R300" },
      { label: "Irregular transaction", value: "R870.00", highlight: true },
    ],
    review: "whether you recognise it.",
  },
];

/* ---------- Interactive showcase ---------- */

export type ShowcaseTx = { date: string; merchant: string; amount: string; highlight?: boolean };

export type ShowcaseItem = {
  tab: string;
  title: string;
  transactions: readonly ShowcaseTx[];
  noticed: string;
  matters: string;
  review: string;
  cant: string;
};

export const SHOWCASE: readonly ShowcaseItem[] = [
  {
    tab: "Recurring subscription",
    title: "A subscription that repeats every month",
    transactions: [
      { date: "15 Jul", merchant: "Video streaming", amount: "R159.00", highlight: true },
      { date: "12 Aug", merchant: "Grocery store", amount: "R531.20" },
      { date: "15 Aug", merchant: "Video streaming", amount: "R159.00", highlight: true },
      { date: "15 Sep", merchant: "Video streaming", amount: "R159.00", highlight: true },
      { date: "15 Oct", merchant: "Video streaming", amount: "R159.00", highlight: true },
    ],
    noticed: "The same merchant charged R159.00 on or around the 15th in four months in a row.",
    matters: "Subscriptions are easy to forget once they are set up, and the amounts rarely look large on their own.",
    review: "Check that you still use it and want to keep paying for it.",
    cant: "TracePay can’t tell whether you still use this service.",
  },
  {
    tab: "Potential duplicate payment",
    title: "Two identical payments on the same day",
    transactions: [
      { date: "14 Oct", merchant: "Ride hailing", amount: "R86.50" },
      { date: "15 Oct", merchant: "Online retailer", amount: "R210.00", highlight: true },
      { date: "15 Oct", merchant: "Online retailer", amount: "R210.00", highlight: true },
      { date: "17 Oct", merchant: "Cash withdrawal", amount: "R500.00" },
    ],
    noticed: "Two payments of exactly R210.00 went to the same merchant on 15 Oct.",
    matters: "A merchant can charge twice by mistake, but two similar payments can also be two real purchases.",
    review: "Look at your receipts or order confirmation. If only one purchase was made, contact the merchant.",
    cant: "TracePay can’t confirm that this is a mistake or a fraud. It only flags the possibility.",
  },
  {
    tab: "Banking fee pattern",
    title: "A monthly fee that went up",
    transactions: [
      { date: "01 Jul", merchant: "Monthly account fee", amount: "R99.00" },
      { date: "01 Aug", merchant: "Monthly account fee", amount: "R99.00" },
      { date: "01 Sep", merchant: "Monthly account fee", amount: "R99.00" },
      { date: "01 Oct", merchant: "Monthly account fee", amount: "R145.00", highlight: true },
      { date: "18 Oct", merchant: "Withdrawal fee", amount: "R12.50", highlight: true },
    ],
    noticed: "This month’s account fee is R46.00 higher than in the three months before it, and a withdrawal fee was added.",
    matters: "Fees can change without much notice and are easy to overlook among other transactions.",
    review: "Compare the charge with your account’s current fee schedule.",
    cant: "TracePay can’t tell whether the new fee is correct for your account type.",
  },
  {
    tab: "Subscription price increase",
    title: "A subscription that costs more than before",
    transactions: [
      { date: "08 Jun", merchant: "Music streaming", amount: "R59.00" },
      { date: "08 Jul", merchant: "Music streaming", amount: "R59.00" },
      { date: "08 Aug", merchant: "Music streaming", amount: "R59.00" },
      { date: "08 Sep", merchant: "Music streaming", amount: "R69.00", highlight: true },
      { date: "08 Oct", merchant: "Music streaming", amount: "R69.00", highlight: true },
    ],
    noticed: "The amount charged by this merchant rose from R59.00 to R69.00 in September and stayed there.",
    matters: "A small increase repeated every month adds up over a year: R10.00 a month is R120.00.",
    review: "Check the merchant’s notice of a price change, and whether a cheaper plan exists.",
    cant: "TracePay can’t tell whether the increase was announced or agreed to.",
  },
];

/* ---------- Security ---------- */

export const PRINCIPLES: readonly { title: string; text: string }[] = [
  { title: "Your consent comes first", text: "TracePay works from the statements you choose to import. Nothing is analysed until you provide it." },
  { title: "Clear explanations of data use", text: "You should be able to see what information is used and why a finding was shown." },
  { title: "Responsible handling", text: "Financial information is treated as sensitive, and only what is needed to find patterns is used." },
  { title: "Appropriate security controls", text: "Protecting your information is part of how the product is designed, not an afterthought." },
  { title: "Honest about limits", text: "TracePay points to patterns. It doesn’t claim to know your intentions or your circumstances." },
];

export const CAN: readonly string[] = [
  "Group payments from the same merchant",
  "Notice repeats, changes in amount and fees",
  "Flag a pattern as worth reviewing",
];

export const CANT: readonly string[] = [
  "Know whether you still use a subscription",
  "Know whether a purchase was necessary",
  "Confirm that a payment is fraud or a mistake",
];
