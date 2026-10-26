export type BillingProduct = "full_analysis" | "annual_monitoring";

export type BillingProducts = {
  currency: "ZAR";
  fullAnalysis: { priceCents: number };
  annualMonitoring: { priceCents: number; available: boolean };
};

export type MonitoringStatus =
  | "none"
  | "pending"
  | "active"
  | "non_renewing"
  | "attention"
  | "cancelled"
  | "expired";

export type BillingEntitlements = {
  fullAnalysis: {
    unlocked: boolean;
    analysisKeys: string[];
    purchasedAt: string | null;
  };
  monitoring: {
    active: boolean;
    status: MonitoringStatus;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    lastPaymentStatus: string | null;
  };
  pending: { reference: string; product: BillingProduct; createdAt: string }[];
};

export type CheckoutResult =
  | { status: "already_owned" }
  | { status: "pending"; reference: string; authorizationUrl: string };

export type PurchaseStatus = "pending" | "succeeded" | "failed" | "abandoned" | "refunded";

export type VerifyResult = {
  status: PurchaseStatus;
  product: BillingProduct;
  entitlements: BillingEntitlements;
};
