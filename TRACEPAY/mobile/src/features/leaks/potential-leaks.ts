export const REVIEW_STATUSES = ["new", "unchanged", "resolved"] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type ReviewIcon = "copy" | "refresh" | "receipt" | "activity" | "calendar";

export type ReviewTransaction = {
  id: string;
  title: string;
  subtitle: string;
  amount: string;
  trailing?: string;
  nextCharge?: string;
  logoDomain?: string;
  brandId?: string;
  mark?: string;
  markColor?: string;
};

export type ReviewStepLink = {
  label: string;
  url: string;
};

export type ReviewStep = {
  title: string;
  detail: string;
  /** Apps or sites the user can open to act on this step. */
  links?: ReviewStepLink[];
};

const BANK_APP_LINKS: ReviewStepLink[] = [
  { label: "FNB", url: "https://www.fnb.co.za/" },
  { label: "Standard Bank", url: "https://www.standardbank.co.za/" },
  { label: "Absa", url: "https://www.absa.co.za/" },
  { label: "Nedbank", url: "https://www.nedbank.co.za/" },
  { label: "Capitec", url: "https://www.capitecbank.co.za/" },
];

export type PotentialLeak = {
  id: string;
  title: string;
  amount: string;
  /** Amount line on the list card. Detail pages use `amount`. */
  listAmount?: string;
  subtitle: string;
  description: string;
  status: ReviewStatus;
  /** Ranks above findings with a lower (or no) priority, whatever their amount. */
  priority?: number;
  icon: ReviewIcon;
  why: string;
  evidence: { label: string; value: string }[];
  transactions: ReviewTransaction[];
  steps: ReviewStep[];
  known: string[];
  uncertain: string[];
  /** Existing fix flow this finding can open. */
  relatedLeakId: string | null;
  /** When this charge is expected to happen again. */
  nextCharge: string;
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  new: "New",
  unchanged: "Unchanged",
  resolved: "Resolved",
};

const POTENTIAL_LEAKS: PotentialLeak[] = [
  {
    id: "duplicate",
    title: "Possible duplicate insurance payments",
    amount: "R17,400",
    listAmount: "R17,400 over 12 months",
    subtitle: "Two insurers have been debiting you R1,450 each month.",
    description: "Possibly paying for the same cover twice",
    status: "new",
    priority: 2,
    icon: "copy",
    why: "Discovery Insure and OUTsurance have both debited R1,450 every month for the past 12 months. If these two policies cover the same car or home, you have been paying for the same cover twice, R17,400 in total. Most people only find out when they switch insurers and forget to cancel the old policy.",
    evidence: [
      { label: "Extra paid", value: "R17,400" },
      { label: "Overlap", value: "12 months" },
    ],
    transactions: [
      {
        id: "insure-disc-nov",
        title: "Discovery Insure",
        subtitle: "1 Nov 2026 • Debit order",
        amount: "R1,450",
        logoDomain: "discovery.co.za",
        mark: "D",
        markColor: "primary",
      },
      {
        id: "insure-out-nov",
        title: "OUTsurance",
        subtitle: "3 Nov 2026 • Debit order",
        amount: "R1,450",
        logoDomain: "outsurance.co.za",
        mark: "O",
        markColor: "primary",
      },
      {
        id: "insure-disc-oct",
        title: "Discovery Insure",
        subtitle: "1 Oct 2026 • Debit order",
        amount: "R1,450",
        logoDomain: "discovery.co.za",
        mark: "D",
        markColor: "primary",
      },
      {
        id: "insure-out-oct",
        title: "OUTsurance",
        subtitle: "3 Oct 2026 • Debit order",
        amount: "R1,450",
        logoDomain: "outsurance.co.za",
        mark: "O",
        markColor: "primary",
      },
    ],
    steps: [
      {
        title: "Check what each policy covers",
        detail: "Log in to both insurers and see what each policy covers. If it's the same car or home, one is a duplicate.",
        links: [
          { label: "Discovery Insure", url: "https://www.discovery.co.za/" },
          { label: "OUTsurance", url: "https://www.outsurance.co.za/" },
        ],
      },
      {
        title: "Cancel the policy you don't need",
        detail: "Keep the policy you want, then ask the other insurer in writing to cancel and refund any premiums paid for overlapping cover.",
        links: [
          { label: "Discovery Insure", url: "https://www.discovery.co.za/" },
          { label: "OUTsurance", url: "https://www.outsurance.co.za/" },
        ],
      },
      {
        title: "Stop the extra debit order",
        detail: "Once the cancellation is confirmed, stop that debit order in your banking app so no more premiums are taken.",
        links: BANK_APP_LINKS,
      },
      {
        title: "Complain if they won't refund",
        detail: "If an insurer refuses to refund overlapping premiums, you can take it to the insurance ombudsman.",
        links: [
          { label: "Ombudsman for Short-term Insurance", url: "https://www.osti.co.za/" },
        ],
      },
    ],
    known: [
      "Two insurers each took R1,450 every month for 12 months.",
      "The two debit orders land two days apart each month.",
    ],
    uncertain: [
      "These could be two different vehicles or properties, which would be genuine cover.",
    ],
    nextCharge: nextMonthStart(),
    relatedLeakId: "debit",
  },
  {
    id: "unused-sub",
    title: "Unused recurring payment",
    amount: "R199",
    listAmount: "R199 / month",
    subtitle: "Not used in 3+ months.",
    description: "Not used in 3+ months",
    status: "new",
    icon: "refresh",
    why: "A recurring payment is still billing you, and there hasn't been matching activity for more than three months.",
    evidence: [
      { label: "Billing", value: "R199 / month" },
      { label: "Last activity", value: "3+ months ago" },
    ],
    transactions: [
      {
        id: "sub-charge",
        title: "Showmax",
        subtitle: "Monthly debit",
        amount: "R199",
        nextCharge: nextMonthlyCharge(),
        logoDomain: "showmax.com",
        mark: "S",
        markColor: "primary",
      },
    ],
    steps: [
      {
        title: "Confirm you still want it",
        detail: "Open the recurring payment and check the last time you used it.",
        links: [{ label: "Showmax", url: "https://www.showmax.com/" }],
      },
      {
        title: "Cancel if it's unused",
        detail: "Follow the cancel guide so the next debit doesn't go through.",
        links: [{ label: "Showmax account", url: "https://www.showmax.com/" }],
      },
      {
        title: "Watch the next statement",
        detail: "A cancelled plan should drop off the following month.",
      },
    ],
    known: ["The plan is still collecting a monthly amount."],
    uncertain: ["Usage outside your bank statement isn't visible to TracePay."],
    nextCharge: nextMonthlyCharge(),
    relatedLeakId: "subs",
  },
  {
    id: "bank-fee",
    title: "Higher than usual bank fee",
    amount: "R145",
    subtitle: "Higher than your usual fees.",
    description: "Higher than your usual fees",
    status: "unchanged",
    icon: "receipt",
    why: "This month's bank charges are higher than the fees we usually see on this account.",
    evidence: [
      { label: "This fee", value: "R145" },
      { label: "Pattern", value: "Above usual" },
    ],
    transactions: [
      {
        id: "monthly-fee",
        title: "Monthly account fee",
        subtitle: "Service charge",
        amount: "R145",
        nextCharge: nextMonthStart(),
        mark: "F",
        markColor: "warning",
      },
    ],
    steps: [
      {
        title: "Check what the fee covers",
        detail: "Compare it with your usual monthly account fee and SMS or ATM charges.",
      },
      {
        title: "Ask the bank if it looks wrong",
        detail: "A one-off penalty or a plan change can explain a higher fee.",
        links: BANK_APP_LINKS,
      },
      {
        title: "Review cheaper account options",
        detail: "Open the bank-fee guide if this charge repeats.",
      },
    ],
    known: ["The fee is higher than the recent pattern on this account."],
    uncertain: ["We can't see whether the bank changed your pricing plan."],
    nextCharge: nextMonthStart(),
    relatedLeakId: "fees",
  },
  {
    id: "loan-increase",
    title: "Loan repayment went up",
    amount: "R7,200",
    listAmount: "R600 / month more",
    subtitle: "Your WesBank repayment rose from R4,850 to R5,450.",
    description: "Repayment up R600 a month",
    status: "new",
    priority: 1,
    icon: "activity",
    why: "Your WesBank vehicle finance debit jumped by R600 in October and stayed there in November. That is R7,200 more a year for the same loan. A higher interest rate, a new fee or an added insurance product can all cause this, and lenders rarely make the change obvious.",
    evidence: [
      { label: "Was", value: "R4,850 / month" },
      { label: "Now", value: "R5,450 / month" },
    ],
    transactions: [
      {
        id: "loan-nov",
        title: "WesBank",
        subtitle: "1 Nov 2026 • Vehicle finance",
        amount: "R5,450",
        trailing: "+R600",
        logoDomain: "wesbank.co.za",
        mark: "W",
        markColor: "warning",
      },
      {
        id: "loan-oct",
        title: "WesBank",
        subtitle: "1 Oct 2026 • Vehicle finance",
        amount: "R5,450",
        trailing: "+R600",
        logoDomain: "wesbank.co.za",
        mark: "W",
        markColor: "warning",
      },
      {
        id: "loan-sep",
        title: "WesBank",
        subtitle: "1 Sep 2026 • Vehicle finance",
        amount: "R4,850",
        logoDomain: "wesbank.co.za",
        mark: "W",
        markColor: "warning",
      },
    ],
    steps: [
      {
        title: "Ask what changed",
        detail: "Log in to your loan account or call the lender and ask why the instalment rose. Ask for the new interest rate, any new fees and any insurance added to the loan.",
        links: [{ label: "WesBank", url: "https://www.wesbank.co.za/" }],
      },
      {
        title: "Remove products you didn't ask for",
        detail: "If an insurance or service plan was added without your clear agreement, ask for it to be removed and the extra amounts refunded.",
        links: [{ label: "WesBank", url: "https://www.wesbank.co.za/" }],
      },
      {
        title: "Compare cheaper options",
        detail: "If the rate itself went up, ask your bank or another lender whether you can refinance at a lower rate.",
        links: BANK_APP_LINKS,
      },
      {
        title: "Complain if the increase is unfair",
        detail: "The credit regulator and the banking ombudsman can step in if a lender raised your repayment without proper notice.",
        links: [
          { label: "National Credit Regulator", url: "https://www.ncr.org.za/" },
          { label: "Ombudsman for Banking Services", url: "https://www.obssa.co.za/" },
        ],
      },
    ],
    known: [
      "The same debit rose from R4,850 to R5,450 in October.",
      "It has stayed at R5,450 for two months since.",
    ],
    uncertain: [
      "We can't see whether the lender sent notice of a rate change.",
    ],
    nextCharge: nextMonthStart(),
    relatedLeakId: "debit",
  },
  {
    id: "inactive-recurring",
    title: "Inactive recurring payment",
    amount: "R120",
    listAmount: "R120 / month",
    subtitle: "No recent activity.",
    description: "No recent activity",
    status: "resolved",
    icon: "calendar",
    why: "A recurring debit is still set up, but there hasn't been a recent charge or matching activity.",
    evidence: [
      { label: "Recurring amount", value: "R120 / month" },
      { label: "Latest check", value: "No recent activity" },
    ],
    transactions: [
      {
        id: "recurring-row",
        title: "Recurring debit",
        subtitle: "No charge this period",
        amount: "R120",
        mark: "R",
        markColor: "success",
      },
    ],
    steps: [
      {
        title: "Confirm the debit is finished",
        detail: "Check the merchant and your bank for a stop or cancellation.",
      },
      {
        title: "Pause it if it's still active",
        detail: "Use the debit-order guide if the mandate is still open.",
      },
      {
        title: "Keep an eye on the next statement",
        detail: "A resolved debit should stay absent next month.",
      },
    ],
    known: ["No recent activity matched this recurring payment."],
    uncertain: ["A skipped month doesn't always mean the mandate is closed."],
    nextCharge: "No further charge expected",
    relatedLeakId: "debit",
  },
];

export function nextMonthlyCharge(from = new Date()): string {
  return formatChargeDate(new Date(from.getFullYear(), from.getMonth() + 1, from.getDate()));
}

export function nextMonthStart(from = new Date()): string {
  return formatChargeDate(new Date(from.getFullYear(), from.getMonth() + 1, 1));
}

function formatChargeDate(date: Date): string {
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function listPotentialLeaks(): PotentialLeak[] {
  return POTENTIAL_LEAKS;
}

export function getPotentialLeak(id: string): PotentialLeak | null {
  return POTENTIAL_LEAKS.find((leak) => leak.id === id) ?? null;
}
