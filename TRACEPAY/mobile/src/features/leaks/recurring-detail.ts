import { formatSubscriptionSource } from "../subscriptions-debug/subscriptions.format";
import type { DetectedSubscription } from "../subscriptions-debug/subscriptions.types";
import { formatUpcomingDate } from "../dashboard/upcoming-payments";
import { formatRandAmount } from "../../utils/currency";
import { amountOfDetected, cadenceOfDetected, detectedChargeId } from "./recurring-charges.catalog";

/** Services that have their own step-by-step cancel guide (action id `cancel-<key>`). */
const GUIDED_SERVICES = ["netflix", "showmax", "spotify", "adobe", "canva"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type RecurringDetail = {
  id: string;
  name: string;
  category: string;
  billing: string;
  amount: string;
  statusLabel: string;
  active: boolean;
  nextCharge: string;
  started: string | null;
  lastCharged: string | null;
  seenCount: number;
  kindLabel: string;
  /** Last five successful charges, oldest first, labelled with the month they were taken. */
  history: { label: string; amount: number }[];
  /** Action id for the cancel guide: the service's own guide when we have one, else the general one. */
  cancelActionId: string;
};

export function findDetectedById(
  subscriptions: readonly DetectedSubscription[],
  id: string | null | undefined,
): DetectedSubscription | null {
  if (!id) return null;
  let wanted = id;
  try {
    wanted = decodeURIComponent(id);
  } catch {
    // Keep the raw id.
  }
  return subscriptions.find((item) => detectedChargeId(item) === wanted) ?? null;
}

function monthYear(iso: string | null | undefined): string | null {
  const match = iso?.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]) - 1;
  return month >= 0 && month <= 11 ? `${MONTHS[month]} ${match[1]}` : null;
}

function statusLabel(status: DetectedSubscription["status"]): string {
  switch (status) {
    case "late":
      return "Late";
    case "failed_recently":
      return "Payment failed";
    case "ended":
      return "Ended";
    default:
      return "Active";
  }
}

export function buildRecurringDetail(subscription: DetectedSubscription): RecurringDetail {
  const successful = (subscription.observations ?? [])
    .filter((row) => row.outcome === "successful" && row.date && row.amount > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-5)
    .map((row) => {
      const month = Number(String(row.date).slice(5, 7)) - 1;
      return { label: MONTHS[month] ?? "—", amount: row.amount };
    });
  const history =
    successful.length > 0
      ? successful
      : (subscription.amountHistory ?? subscription.observedAmounts ?? [])
          .filter((value) => value > 0)
          .slice(-5)
          .map((amount, index) => ({ label: `#${index + 1}`, amount }));

  const lower = subscription.displayName.toLowerCase();
  const guided = GUIDED_SERVICES.find((key) => lower.includes(key));
  const cadence = cadenceOfDetected(subscription);
  const next = subscription.nextExpectedDate?.slice(0, 10) ?? null;
  const last = subscription.lastSuccessfulCharge?.slice(0, 10) ?? null;

  return {
    id: detectedChargeId(subscription),
    name: subscription.displayName,
    category: subscription.category?.trim() || "Recurring",
    billing: cadence === "yearly" ? "Billed yearly" : "Billed monthly",
    amount: formatRandAmount(amountOfDetected(subscription)),
    statusLabel: statusLabel(subscription.status),
    active: subscription.status !== "ended",
    nextCharge: next ? formatUpcomingDate(next) : "Not expected yet",
    started: monthYear(subscription.firstObservedDate),
    lastCharged: last ? formatUpcomingDate(last) : null,
    seenCount: subscription.observationCount,
    kindLabel: formatSubscriptionSource(subscription.source),
    history,
    cancelActionId: guided ? `cancel-${guided}` : "cancel",
  };
}
