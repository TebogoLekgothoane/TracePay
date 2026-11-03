import type { BillingEntitlements, BillingProducts, MonitoringStatus } from "./billing.types";

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
  };
}
