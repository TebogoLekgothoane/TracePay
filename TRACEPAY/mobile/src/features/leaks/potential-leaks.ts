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
  /** Raw bank description; when set the row renders like the Transactions page. */
  description?: string;
  direction?: "debit" | "credit";
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

