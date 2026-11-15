import { listSubscriptions } from "./subscriptions.catalog";

export type RecurringChargeKind = "subscription" | "debit" | "obligation" | "custom";
export type RecurringChargeCadence = "monthly" | "yearly";
export type RecurringChargeStatus = "Active" | "Inactive";

export type RecurringCharge = {
  id: string;
  name: string;
  kind: RecurringChargeKind;
  category: string;
  billing: string;
  billingDate: string;
  amount: string;
  status: RecurringChargeStatus;
  brandId?: string;
  logoDomain?: string;
  mark: string;
  /** Where tapping the row should go. */
  href?: string;
};

/**
 * Non-subscription recurring money that still hits the account on a fixed day:
 * debit orders, insurance, rent, loans, school fees, etc.
 */
const FIXED_RECURRING_CHARGES: readonly RecurringCharge[] = [
  {
    id: "dstv",
    name: "DStv Premium",
    kind: "debit",
    category: "Entertainment",
    billing: "Billed monthly",
    billingDate: "1st of each month",
    amount: "R899.00",
    status: "Active",
    logoDomain: "dstv.com",
    mark: "D",
    href: "/leak/debit/item/dstv",
  },
  {
    id: "gym",
    name: "Gym membership",
    kind: "debit",
    category: "Health",
    billing: "Billed monthly",
    billingDate: "3rd of each month",
    amount: "R450.00",
    status: "Active",
    mark: "G",
    href: "/leak/debit/item/gym",
  },
  {
    id: "insurance",
    name: "Car & home insurance",
    kind: "debit",
    category: "Insurance",
    billing: "Billed monthly",
    billingDate: "15th of each month",
    amount: "R320.75",
    status: "Active",
    mark: "I",
    href: "/leak/debit/item/insurance",
  },
  {
    id: "rent",
    name: "Rent",
    kind: "obligation",
    category: "Housing",
    billing: "Billed monthly",
    billingDate: "1st of each month",
    amount: "R8500.00",
    status: "Active",
    mark: "R",
  },
  {
    id: "personal-loan",
    name: "Personal loan repayment",
    kind: "obligation",
    category: "Debt",
    billing: "Billed monthly",
    billingDate: "25th of each month",
    amount: "R2150.00",
    status: "Active",
    mark: "L",
  },
  {
    id: "medical-aid",
    name: "Medical aid",
    kind: "obligation",
    category: "Health",
    billing: "Billed monthly",
    billingDate: "1st of each month",
    amount: "R3280.00",
    status: "Active",
    mark: "M",
  },
  {
    id: "school-fees",
    name: "School fees",
    kind: "obligation",
    category: "Education",
    billing: "Billed monthly",
    billingDate: "7th of each month",
    amount: "R2900.00",
    status: "Active",
    mark: "S",
  },
  {
    id: "vehicle-finance",
    name: "Vehicle finance",
    kind: "obligation",
    category: "Debt",
    billing: "Billed monthly",
    billingDate: "28th of each month",
    amount: "R4650.00",
    status: "Active",
    mark: "V",
  },
] as const;

/** Every recurring charge TracePay should surface on the billing calendar. */
export function listRecurringCharges(
  extras: readonly RecurringCharge[] = [],
): RecurringCharge[] {
  const subscriptions: RecurringCharge[] = listSubscriptions().map((item) => ({
    id: item.id,
    name: item.name,
    kind: "subscription",
    category: item.category,
    billing: item.billing,
    billingDate: item.billingDate,
    amount: item.amount,
    status: item.status,
    brandId: item.brandId,
    logoDomain: item.logoDomain,
    mark: item.mark,
    href: `/leak/subscription/${item.id}`,
  }));

  return [...subscriptions, ...FIXED_RECURRING_CHARGES, ...extras];
}

export function cadenceOfCharge(item: RecurringCharge): RecurringChargeCadence {
  return item.billing.toLowerCase().includes("year") ? "yearly" : "monthly";
}

export function kindLabel(kind: RecurringChargeKind): string {
  if (kind === "subscription") return "Subscription";
  if (kind === "debit") return "Debit order";
  if (kind === "custom") return "Added";
  return "Recurring";
}
