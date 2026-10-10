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

export type ReviewStep = {
  title: string;
  detail: string;
};

export type PotentialLeak = {
  id: string;
  title: string;
  amount: string;
  /** Amount line on the list card. Detail pages use `amount`. */
  listAmount?: string;
  subtitle: string;
  description: string;
  status: ReviewStatus;
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
    title: "Possible duplicate payment",
    amount: "R420",
    subtitle: "Two similar payments to Takealot within 3 days.",
    description: "Two similar payments to Takealot",
    status: "new",
    icon: "copy",
    why: "You made two payments to Takealot for a similar amount within a short period. This may be a duplicate payment.",
    evidence: [
      { label: "Flag", value: "Potential duplicate" },
      { label: "Confidence", value: "High" },
    ],
    transactions: [
      {
        id: "takealot-12",
        title: "Takealot",
        subtitle: "12 Oct 2025",
        amount: "R210",
        logoDomain: "takealot.com",
        mark: "T",
        markColor: "primary",
      },
      {
        id: "takealot-15",
        title: "Takealot",
        subtitle: "15 Oct 2025",
        amount: "R210",
        logoDomain: "takealot.com",
        mark: "T",
        markColor: "primary",
      },
    ],
    steps: [
      {
        title: "Check if you received two orders",
        detail: "Look at your Takealot account or order confirmation emails.",
      },
      {
        title: "Contact Takealot if needed",
        detail: "If this was a duplicate, request a refund.",
      },
      {
        title: "Monitor your next statement",
        detail: "We'll check future statements to see if this issue is resolved.",
      },
    ],
    known: [
      "Two payments of R210 to Takealot within 3 days.",
      "Both transactions have similar descriptions.",
    ],
    uncertain: [
      "We can't confirm whether this was a duplicate or two separate purchases.",
    ],
    nextCharge: "Not scheduled again",
    relatedLeakId: null,
  },
  {
    id: "unused-sub",
    title: "Unused subscription",
    amount: "R199",
    listAmount: "R199 / month",
    subtitle: "Not used in 3+ months.",
    description: "Not used in 3+ months",
    status: "new",
    icon: "refresh",
    why: "A subscription is still billing you, and there hasn't been matching activity for more than three months.",
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
        detail: "Open the subscription and check the last time you used it.",
      },
      {
        title: "Cancel if it's unused",
        detail: "Follow the cancel guide so the next debit doesn't go through.",
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
    id: "irregular",
    title: "Irregular transaction",
    amount: "R850",
    subtitle: "Unusual merchant or pattern.",
    description: "Unusual merchant or pattern",
    status: "unchanged",
    icon: "activity",
    why: "This payment doesn't match the merchants or amounts you usually have in this category.",
    evidence: [
      { label: "Amount", value: "R850" },
      { label: "Pattern", value: "Unusual" },
    ],
    transactions: [
      {
        id: "irregular-row",
        title: "Card purchase",
        subtitle: "Outside your usual merchants",
        amount: "R850",
        mark: "?",
        markColor: "secondary",
      },
    ],
    steps: [
      {
        title: "Check if you recognise it",
        detail: "Look at the date and amount against your receipts or cart history.",
      },
      {
        title: "Contact your bank if you don't",
        detail: "Ask them to confirm the merchant before you dispute it.",
      },
      {
        title: "Leave it if it was you",
        detail: "Record that you've reviewed it so it stays on your list as handled.",
      },
    ],
    known: ["The amount stands out from your recent spending pattern."],
    uncertain: ["A new merchant can be a real purchase, not a problem."],
    nextCharge: "Not scheduled again",
    relatedLeakId: null,
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
