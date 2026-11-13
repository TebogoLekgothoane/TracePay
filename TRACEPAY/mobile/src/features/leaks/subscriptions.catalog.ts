export type SubscriptionMarkColor =
  | "destructive"
  | "primary"
  | "success"
  | "secondary";

export type SubscriptionStatus = "Active" | "Inactive";

export type SubscriptionCatalogItem = {
  id: string;
  name: string;
  brandId?: string;
  logoDomain?: string;
  mark: string;
  markColor: SubscriptionMarkColor;
  category: string;
  billing: string;
  amount: string;
  status: SubscriptionStatus;
  billingDate: string;
  paymentMethod: string;
  startDate: string;
  history: number[];
};

export const SUBSCRIPTION_CATALOG: readonly SubscriptionCatalogItem[] = [
  {
    id: "netflix",
    name: "Netflix",
    brandId: "netflix",
    logoDomain: "netflix.com",
    mark: "N",
    markColor: "destructive",
    category: "Entertainment",
    billing: "Billed monthly",
    amount: "R159.00",
    status: "Active",
    billingDate: "15th of each month",
    paymentMethod: "Capitec ·••• 9101",
    startDate: "Jan 2024",
    history: [159, 159, 159, 159, 159],
  },
  {
    id: "showmax",
    name: "Showmax",
    logoDomain: "showmax.com",
    mark: "S",
    markColor: "primary",
    category: "Entertainment",
    billing: "Billed monthly",
    amount: "R99.00",
    status: "Active",
    billingDate: "1st of each month",
    paymentMethod: "Capitec ·••• 9101",
    startDate: "Mar 2024",
    history: [99, 99, 99, 99, 99],
  },
  {
    id: "spotify",
    name: "Spotify Premium",
    brandId: "spotify",
    logoDomain: "spotify.com",
    mark: "♪",
    markColor: "success",
    category: "Music",
    billing: "Billed monthly",
    amount: "R69.00",
    status: "Active",
    billingDate: "8th of each month",
    paymentMethod: "MTN MoMo ·••• 5678",
    startDate: "Nov 2023",
    history: [69, 69, 69, 69, 69],
  },
  {
    id: "youtube",
    name: "YouTube Premium",
    brandId: "youtube",
    logoDomain: "youtube.com",
    mark: "▶",
    markColor: "destructive",
    category: "Music",
    billing: "Billed monthly",
    amount: "R72.00",
    status: "Active",
    billingDate: "12th of each month",
    paymentMethod: "Capitec ·••• 9101",
    startDate: "Feb 2024",
    history: [72, 72, 72, 72, 72],
  },
  {
    id: "adobe",
    name: "Adobe Acrobat",
    brandId: "adobe",
    logoDomain: "adobe.com",
    mark: "A",
    markColor: "destructive",
    category: "Productivity",
    billing: "Billed yearly",
    amount: "R519.00",
    status: "Inactive",
    billingDate: "3rd of January",
    paymentMethod: "Capitec ·••• 9101",
    startDate: "Jan 2024",
    history: [0, 0, 0, 0, 519],
  },
  {
    id: "canva",
    name: "Canva Pro",
    logoDomain: "canva.com",
    mark: "C",
    markColor: "secondary",
    category: "Design",
    billing: "Billed yearly",
    amount: "R599.00",
    status: "Inactive",
    billingDate: "20th of March",
    paymentMethod: "Capitec ·••• 9101",
    startDate: "Mar 2024",
    history: [0, 0, 0, 0, 599],
  },
] as const;

const BY_ID = Object.fromEntries(
  SUBSCRIPTION_CATALOG.map((item) => [item.id, item]),
) as Record<string, SubscriptionCatalogItem>;

export function getSubscriptionById(
  id: string | null | undefined,
): SubscriptionCatalogItem {
  if (id && BY_ID[id]) return BY_ID[id];
  return BY_ID.netflix!;
}

export function listSubscriptions(): SubscriptionCatalogItem[] {
  return [...SUBSCRIPTION_CATALOG];
}

export type UpcomingSubscription = SubscriptionCatalogItem & {
  nextChargeDate: Date;
  nextChargeLabel: string;
  daysUntil: number;
};

function parseBillingDay(billingDate: string): number | null {
  const match = billingDate.match(/(\d{1,2})(st|nd|rd|th)/i);
  if (!match) return null;
  const day = Number(match[1]);
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}

function nextChargeFromBillingDate(
  billingDate: string,
  billing: string,
  from = new Date(),
): Date {
  const yearly = billing.toLowerCase().includes("year");
  const day = parseBillingDay(billingDate) ?? from.getDate();

  if (yearly) {
    const monthMatch = billingDate.match(
      /(january|february|march|april|may|june|july|august|september|october|november|december)/i,
    );
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const month = monthMatch
      ? months.indexOf(monthMatch[1]!.toLowerCase())
      : from.getMonth();
    let next = new Date(from.getFullYear(), month, day);
    if (next.getTime() <= from.getTime()) {
      next = new Date(from.getFullYear() + 1, month, day);
    }
    return next;
  }

  let next = new Date(from.getFullYear(), from.getMonth(), day);
  if (next.getTime() <= from.getTime()) {
    next = new Date(from.getFullYear(), from.getMonth() + 1, day);
  }
  return next;
}

function formatChargeLabel(date: Date): string {
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Active subscriptions with a next charge, soonest first. */
export function listUpcomingSubscriptions(
  from = new Date(),
): UpcomingSubscription[] {
  const today = startOfDay(from);
  return listSubscriptions()
    .filter((item) => item.status === "Active")
    .map((item) => {
      const nextChargeDate = nextChargeFromBillingDate(
        item.billingDate,
        item.billing,
        today,
      );
      const daysUntil = Math.max(
        0,
        Math.round(
          (startOfDay(nextChargeDate).getTime() - today.getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      );
      return {
        ...item,
        nextChargeDate,
        nextChargeLabel: formatChargeLabel(nextChargeDate),
        daysUntil,
      };
    })
    .sort((a, b) => a.nextChargeDate.getTime() - b.nextChargeDate.getTime());
}
