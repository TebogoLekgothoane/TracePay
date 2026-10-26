import type {
  BillingEntitlements,
  BillingProduct,
  BillingProducts,
  CheckoutResult,
  MonitoringStatus,
  PurchaseStatus,
  VerifyResult,
} from "./billing.types";

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  return value && typeof value === "object" ? (value as Obj) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const MONITORING: MonitoringStatus[] = [
  "none",
  "pending",
  "active",
  "non_renewing",
  "attention",
  "cancelled",
  "expired",
];

export function parseProducts(payload: unknown): BillingProducts {
  const root = obj(payload);
  const full = obj(root.full_analysis);
  const annual = obj(root.annual_monitoring);
  return {
    currency: "ZAR",
    fullAnalysis: { priceCents: Number(full.price_cents) || 0 },
    annualMonitoring: {
      priceCents: Number(annual.price_cents) || 0,
      available: annual.available === true,
    },
  };
}

export function parseEntitlements(payload: unknown): BillingEntitlements {
  const root = obj(payload);
  const full = obj(root.full_analysis);
  const monitoring = obj(root.monitoring);
  const status = MONITORING.find((candidate) => candidate === monitoring.status) ?? "none";
  const pending = Array.isArray(root.pending) ? root.pending : [];
  return {
    fullAnalysis: {
      unlocked: full.unlocked === true,
      analysisKeys: Array.isArray(full.analysis_keys)
        ? full.analysis_keys.filter((key): key is string => typeof key === "string")
        : [],
      purchasedAt: str(full.purchased_at),
    },
    monitoring: {
      active: monitoring.active === true,
      status,
      currentPeriodEnd: str(monitoring.current_period_end),
      cancelAtPeriodEnd: monitoring.cancel_at_period_end === true,
      lastPaymentStatus: str(monitoring.last_payment_status),
    },
    pending: pending.flatMap((entry) => {
      const row = obj(entry);
      const reference = str(row.reference);
      const product: BillingProduct | null =
        row.product === "annual_monitoring" || row.product === "full_analysis"
          ? row.product
          : null;
      return reference && product
        ? [{ reference, product, createdAt: str(row.created_at) ?? "" }]
        : [];
    }),
  };
}

export function parseCheckout(payload: unknown): CheckoutResult {
  const root = obj(payload);
  if (root.status === "already_owned") return { status: "already_owned" };
  const reference = str(root.reference);
  const url = str(root.authorization_url);
  if (reference && url && url.startsWith("https://")) {
    return { status: "pending", reference, authorizationUrl: url };
  }
  throw new Error("Checkout could not be started.");
}

const PURCHASE_STATUSES: PurchaseStatus[] = [
  "pending",
  "succeeded",
  "failed",
  "abandoned",
  "refunded",
];

export function parseVerify(payload: unknown): VerifyResult {
  const root = obj(payload);
  const status = PURCHASE_STATUSES.find((candidate) => candidate === root.status);
  if (!status) throw new Error("Payment status unavailable.");
  return {
    status,
    product: root.product === "annual_monitoring" ? "annual_monitoring" : "full_analysis",
    entitlements: parseEntitlements(root.entitlements),
  };
}
