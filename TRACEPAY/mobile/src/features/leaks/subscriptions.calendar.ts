import { parseRandAmount } from "../../utils/currency";
import {
  cadenceOfCharge,
  listRecurringCharges,
  type RecurringCharge,
  type RecurringChargeCadence,
  type RecurringChargeKind,
} from "./recurring-charges.catalog";

export type { RecurringCharge };

export type CalendarBillingCadence = RecurringChargeCadence;

export type CalendarChargeMark = {
  id: string;
  name: string;
  brandId?: string;
  logoDomain?: string;
  mark: string;
  cadence: CalendarBillingCadence;
  kind: RecurringChargeKind;
  category: string;
  amount: number;
  href?: string;
};

/** @deprecated Use CalendarChargeMark — kept for existing imports. */
export type CalendarSubscriptionMark = CalendarChargeMark;

export type SubscriptionCalendarDay = {
  key: string;
  date: number;
  year: number;
  month: number;
  isMuted: boolean;
  isToday: boolean;
  charges: CalendarChargeMark[];
  /** Alias for charges so existing UI keeps working during rename. */
  subscriptions: CalendarChargeMark[];
};

export type SubscriptionCalendarMonth = {
  year: number;
  month: number;
  monthLabel: string;
  days: SubscriptionCalendarDay[];
  monthlyTotal: number;
  chargesCount: number;
  /** Alias for chargesCount. */
  subscriptionsCount: number;
  dueCount: number;
  /** Alias for dueCount. */
  newCount: number;
  monthlyCount: number;
  yearlyCount: number;
};

const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export { WEEKDAY_LABELS };

function parseBillingDay(billingDate: string): number | null {
  const match = billingDate.match(/(\d{1,2})(st|nd|rd|th)/i);
  if (!match) return null;
  const day = Number(match[1]);
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}

function parseBillingMonth(billingDate: string): number | null {
  const monthMatch = billingDate.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december)/i,
  );
  if (!monthMatch) return null;
  return MONTH_NAMES.findIndex((name) => name.toLowerCase() === monthMatch[1]!.toLowerCase());
}

function clampDay(year: number, month: number, day: number): number {
  const last = new Date(year, month + 1, 0).getDate();
  return Math.min(day, last);
}

function toMark(item: RecurringCharge): CalendarChargeMark {
  return {
    id: item.id,
    name: item.name,
    brandId: item.brandId,
    logoDomain: item.logoDomain,
    mark: item.mark,
    cadence: cadenceOfCharge(item),
    kind: item.kind,
    category: item.category,
    amount: parseRandAmount(item.amount),
    href: item.href,
  };
}

function marksForDay(
  items: RecurringCharge[],
  year: number,
  month: number,
  day: number,
): CalendarChargeMark[] {
  return items.flatMap((item) => {
    const billingDay = parseBillingDay(item.billingDate);
    if (!billingDay) return [];

    const cadence = cadenceOfCharge(item);
    if (cadence === "yearly") {
      const billingMonth = parseBillingMonth(item.billingDate);
      if (billingMonth === null || billingMonth !== month) return [];
    }

    if (clampDay(year, month, billingDay) !== day) return [];
    return [toMark(item)];
  });
}

function makeDay(
  partial: Omit<SubscriptionCalendarDay, "subscriptions" | "charges"> & {
    charges: CalendarChargeMark[];
  },
): SubscriptionCalendarDay {
  return {
    ...partial,
    subscriptions: partial.charges,
  };
}

/** Monday-first month grid covering all recurring charges (subs, debit orders, obligations). */
export function buildSubscriptionCalendarMonth(
  year: number,
  month: number,
  from = new Date(),
  extras: readonly RecurringCharge[] = [],
): SubscriptionCalendarMonth {
  const items = listRecurringCharges(extras);
  const active = items.filter((item) => item.status === "Active");
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayIndex = (first.getDay() + 6) % 7;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  const days: SubscriptionCalendarDay[] = [];

  for (let i = 0; i < mondayIndex; i += 1) {
    const date = new Date(year, month, -mondayIndex + i + 1);
    days.push(
      makeDay({
        key: `pad-prev-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
        date: date.getDate(),
        year: date.getFullYear(),
        month: date.getMonth(),
        isMuted: true,
        isToday: false,
        charges: [],
      }),
    );
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const current = new Date(year, month, day);
    days.push(
      makeDay({
        key: `day-${year}-${month}-${day}`,
        date: day,
        year,
        month,
        isMuted: false,
        isToday: current.getTime() === today.getTime(),
        charges: marksForDay(items, year, month, day),
      }),
    );
  }

  while (days.length % 7 !== 0) {
    const index = days.length - (mondayIndex + daysInMonth);
    const date = new Date(year, month + 1, index + 1);
    days.push(
      makeDay({
        key: `pad-next-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
        date: date.getDate(),
        year: date.getFullYear(),
        month: date.getMonth(),
        isMuted: true,
        isToday: false,
        charges: [],
      }),
    );
  }

  const monthlyTotal = active
    .filter((item) => cadenceOfCharge(item) === "monthly")
    .reduce((sum, item) => sum + parseRandAmount(item.amount), 0);

  const yearlyInMonth = items.filter((item) => {
    if (cadenceOfCharge(item) !== "yearly") return false;
    const billingMonth = parseBillingMonth(item.billingDate);
    return billingMonth === month;
  });

  const dueCount = yearlyInMonth.length;
  const chargesCount = items.length;

  return {
    year,
    month,
    monthLabel: MONTH_NAMES[month] ?? "Month",
    days,
    monthlyTotal:
      monthlyTotal + yearlyInMonth.reduce((sum, item) => sum + parseRandAmount(item.amount), 0),
    chargesCount,
    subscriptionsCount: chargesCount,
    dueCount,
    newCount: dueCount,
    monthlyCount: items.filter((item) => cadenceOfCharge(item) === "monthly").length,
    yearlyCount: items.filter((item) => cadenceOfCharge(item) === "yearly").length,
  };
}

export function shiftCalendarMonth(year: number, month: number, delta: number): {
  year: number;
  month: number;
} {
  const next = new Date(year, month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}
