// Shape of GET /superadmin/api/metrics (see backend app/superadmin_metrics.py build_metrics).

export interface Series {
  labels: string[];
  values: number[];
}

export interface Alert {
  level: "warning" | "info";
  text: string;
}

export interface Kpis {
  registered_total: number;
  accounts_total: number;
  unverified_total: number;
  new_in_range: number;
  active_7d: number;
  statements_in_range: number;
  processed_in_range: number;
  paying_users: number;
  sales_in_range: number;
  revenue_range_zar: number;
  revenue_all_zar: number;
  conversion_pct: number;
  arpu_zar: number;
  monitoring_live: number;
  waitlist_total: number;
  failure_rate: number;
}

export interface Registrations {
  total: number;
  verified: number;
  unverified: number;
  new_verified_in_range: number;
  new_today: number;
  new_7d: number;
  new_30d: number;
  new_in_range: number;
  active_7d: number;
  active_30d: number;
  signed_up_once: number;
  with_email: number;
  with_phone: number;
  signups: Series;
}

export interface FunnelStep {
  stage: string;
  count: number;
}

export interface Statements {
  cancelled_in_range: number;
  total: number;
  in_range: number;
  status_all: Record<string, number>;
  status_range: Record<string, number>;
  extraction_methods: Record<string, number>;
  failure_rate: number;
  transactions_imported_in_range: number;
  transactions_total: number;
  users_uploaded: number;
  uploaded_not_processed: number;
  series: { uploaded: Series; processed: Series; failed: Series };
  failure_reasons: { reason: string; count: number }[];
}

export interface RecentPurchase {
  when: string | null;
  user: string;
  product: string;
  amount_zar: number;
  status: string;
}

export interface Sales {
  paying_users: number;
  conversion_pct: number;
  revenue_all_zar: number;
  revenue_range_zar: number;
  sales_in_range: number;
  arpu_zar: number;
  refunded_count: number;
  refunded_zar: number;
  status_counts: Record<string, number>;
  by_product: Record<string, { count: number; revenue_zar: number }>;
  price_zar: { full_analysis: number; annual_monitoring: number };
  subscription_status: Record<string, number>;
  monitoring_live: number;
  monitoring_cancelling: number;
  monitoring_value_zar: number;
  series: { revenue: Series; sales: Series };
  recent: RecentPurchase[];
}

export interface Waitlist {
  total: number;
  in_range: number;
  interests: Record<string, number>;
  sources: Record<string, number>;
  series: Series;
  cumulative: Series;
}

export interface AiSummary {
  calls: number;
  items: number;
  success: number;
  rejected: number;
  failed: number;
  tokens_in: number;
  tokens_out: number;
  tokens: number;
  cost_usd: number;
  unpriced_tokens: number;
  avg_ms: number | null;
}

export interface AiByFeature extends AiSummary {
  feature: string;
  label: string;
}

export interface AiByModel extends AiSummary {
  provider: string;
  model: string;
}

export interface Ai {
  logging_ready: boolean;
  total: AiSummary;
  by_feature: AiByFeature[];
  by_model: AiByModel[];
  series: {
    labels: string[];
    calls_by_feature: { feature: string; label: string; values: number[] }[];
    tokens: number[];
  };
  budget: {
    daily_item_limit: number;
    items_used_current_window: number;
    users_with_usage: number;
    top_users: { user: string; used: number; pct_of_limit: number }[];
  };
  prices_note: string;
}

export interface RecentSignup {
  when: string;
  user: string;
  last_sign_in: string | null;
  statements: number;
  paying: boolean;
}

export interface Metrics {
  generated_at: string;
  loaded_at: string | null;
  range_days: number;
  range_start: string;
  timezone: string;
  truncated: string[];
  missing_tables: string[];
  kpis: Kpis;
  alerts: Alert[];
  registrations: Registrations;
  funnel: FunnelStep[];
  statements: Statements;
  sales: Sales;
  waitlist: Waitlist;
  ai: Ai;
  recent_signups: RecentSignup[];
}
