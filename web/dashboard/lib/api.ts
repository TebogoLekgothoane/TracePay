import { getSupabase } from "./supabase";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://127.0.0.1:8001";
const API_VERSION_PREFIX = "/v1";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export interface ApiError {
  detail?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiClient {
  private baseUrl: string;
  private pendingRequests = new Map<string, Promise<any>>();

  constructor(baseUrl: string = API_BASE_URL) {
    // Force IPv4 loopback in browser to avoid ::1 preference
    let finalBase = baseUrl;
    if (typeof window !== "undefined" && finalBase.includes("localhost")) {
      finalBase = finalBase.replace("localhost", "127.0.0.1");
    }
    this.baseUrl = finalBase.endsWith("/") ? finalBase.slice(0, -1) : finalBase;
    this.baseUrl = this.baseUrl.replace(/\/v\d+$/, "");
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 15000 // Make timeout configurable
  ): Promise<T> {
    // Normalize endpoint
    const rawEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const cleanEndpoint = /^\/v\d+(\/|$)/.test(rawEndpoint)
      ? rawEndpoint
      : `${API_VERSION_PREFIX}${rawEndpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    // Create a unique key for this request (include timeout in key to allow different timeouts for same endpoint)
    const requestKey = `${options.method || "GET"}:${url}:${timeoutMs}`;

    // If there's already a pending request for this endpoint, return it
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
      ...(options.headers as Record<string, string> ?? {}),
    };

    // Add timeout (very helpful for debugging hanging requests)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs); // Use configurable timeout

    // Create the request promise
    const requestPromise = (async () => {
      try {
        console.log("[API Request]", options.method || "GET", url); // ← debug

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
          // Important in Next.js + browser context
          credentials: "same-origin", // or "include" if you use cookies
          cache: "no-store",          // avoid stale Next.js cache issues
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorData: ApiError;
          try {
            errorData = await response.json();
          } catch {
            errorData = {
              detail: `HTTP ${response.status} ${response.statusText}`,
            };
          }
          console.error("[API Error]", response.status, url, errorData);
          throw new Error(errorData.error?.message || errorData.detail || "API request failed");
        }

        const data = await response.json();
        return data as T;
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err.name === "AbortError") {
          throw new Error("Request timeout - backend may be down or too slow");
        }

        if (err.message?.includes("fetch")) {
          console.error("[Fetch failed]", err.message, url);
          throw new Error(
            `Failed to fetch ${url}\n` +
            `→ Is backend running at ${this.baseUrl}?\n` +
            `→ Check NEXT_PUBLIC_API_URL or NEXT_PUBLIC_BACKEND_URL in .env.local / Vercel\n` +
            `→ CORS / network / firewall issue?`
          );
        }

        throw err;
      } finally {
        // Remove from pending requests when done
        this.pendingRequests.delete(requestKey);
      }
    })();

    // Store the pending request
    this.pendingRequests.set(requestKey, requestPromise);

    return requestPromise;
  }

  // Auth (register/login/logout/password-reset/email-verification) all go
  // straight through Supabase Auth via lib/auth.tsx and lib/supabase.ts, not
  // through this client.

  // Analysis endpoints
  async analyze(transactions: any[]) {
    return this.request<{
      financial_health_score: number;
      health_band: "green" | "yellow" | "red";
      money_leaks: any[];
      summary_plain_language: string;
    }>("/analyze", {
      method: "POST",
      body: JSON.stringify({ transactions }),
    });
  }

  // Investor endpoints -- curated, aggregate-only, no individual is ever identifiable
  async getInvestorOverview() {
    return this.request<{
      total_users: number;
      active_users: number;
      total_analyses: number;
      average_health_score: number;
      total_capital_protected: number;
      total_frozen_items: number;
    }>("/investor/overview", {}, 30000);
  }

  async getInvestorRegional() {
    return this.request<
      Array<{
        region: string;
        average_health_score: number;
        total_leaks: number;
        total_users: number;
        top_leak_type: string;
      }>
    >("/investor/regional", {}, 30000);
  }

  // Personal (me) endpoints -- the caller's own data, never another user's
  async getMySummary() {
    return this.request<{
      financial_health_score: number | null;
      health_band: string | null;
      leaks_found: number;
      potential_monthly_savings: number;
      linked_accounts_count: number;
      frozen_items_count: number;
      last_analyzed_at: string | null;
    }>("/me/summary");
  }

  async getMyAccountSettings() {
    return this.request<{
      account_type: "individual" | "business";
      business_name: string | null;
    }>("/me/account");
  }

  async updateMyAccountSettings(data: {
    account_type: "individual" | "business";
    business_name?: string | null;
  }) {
    return this.request<{
      account_type: "individual" | "business";
      business_name: string | null;
    }>("/me/account", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async analyzeMine(transactions: any[]) {
    return this.request<{
      id: number;
      financial_health_score: number;
      health_band: string;
      money_leaks: Array<{
        detector?: string;
        title?: string;
        severity?: string;
        estimated_monthly_cost?: number;
        [key: string]: any;
      }>;
      summary_plain_language: string;
      transaction_count: number;
      created_at: string;
    }>("/me/analyze", {
      method: "POST",
      body: JSON.stringify({ transactions }),
    });
  }

  async getMyAnalyses(limit: number = 10) {
    return this.request<
      Array<{
        id: number;
        financial_health_score: number;
        health_band: string;
        money_leaks: Array<{
          detector?: string;
          title?: string;
          severity?: string;
          estimated_monthly_cost?: number;
          [key: string]: any;
        }>;
        summary_plain_language: string;
        transaction_count: number;
        created_at: string;
      }>
    >(`/me/analyses?limit=${limit}`);
  }

  // Reward partner endpoints -- redemption available to any signed-in
  // account; the /partner/* views are gated server-side to that partner's
  // own owner_user_id (or admin).
  async listPartners() {
    return this.request<
      Array<{
        id: string;
        name: string;
        offer_description: string;
        points_cost: number;
      }>
    >("/partners");
  }

  async redeemPartnerOffer(partnerId: string) {
    return this.request<{
      redemption_id: number;
      partner_id: string;
      points_spent: number;
      remaining_points: number;
    }>("/me/redeem", {
      method: "POST",
      body: JSON.stringify({ partner_id: partnerId }),
    });
  }

  async getPartnerSummary() {
    return this.request<{
      partner_id: string;
      partner_name: string;
      total_redemptions: number;
      total_points_redeemed: number;
      total_commission_owed: number;
    }>("/partner/summary");
  }

  async getPartnerRedemptions() {
    return this.request<
      Array<{
        id: number;
        points_spent: number;
        commission_amount: number;
        status: string;
        redeemed_at: string;
      }>
    >("/partner/redemptions");
  }

  // Admin partner management -- provisioning new commission partners and
  // linking a Partner row to the account that will log in as its owner.
  async adminListPartners() {
    return this.request<
      Array<{
        id: string;
        name: string;
        offer_description: string;
        points_cost: number;
        estimated_value_rand: number;
        commission_rate: number;
        is_active: boolean;
        owner_user_id: string | null;
        total_redemptions: number;
        total_commission_owed: number;
      }>
    >("/admin/partners");
  }

  async adminCreatePartner(data: {
    id: string;
    name: string;
    offer_description: string;
    points_cost: number;
    estimated_value_rand: number;
    commission_rate?: number;
    owner_user_id?: string | null;
  }) {
    return this.request<{
      id: string;
      name: string;
      offer_description: string;
      points_cost: number;
      estimated_value_rand: number;
      commission_rate: number;
      is_active: boolean;
      owner_user_id: string | null;
      total_redemptions: number;
      total_commission_owed: number;
    }>("/admin/partners", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async adminUpdatePartner(
    partnerId: string,
    data: Partial<{
      name: string;
      offer_description: string;
      points_cost: number;
      estimated_value_rand: number;
      commission_rate: number;
      is_active: boolean;
      owner_user_id: string | null;
    }>
  ) {
    return this.request<{
      id: string;
      name: string;
      offer_description: string;
      points_cost: number;
      estimated_value_rand: number;
      commission_rate: number;
      is_active: boolean;
      owner_user_id: string | null;
      total_redemptions: number;
      total_commission_owed: number;
    }>(`/admin/partners/${encodeURIComponent(partnerId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Account endpoints
  async linkAccount(data: {
    bank_name: string;
    account_id?: string;
    open_banking_consent_id?: string;
    metadata?: Record<string, any>;
  }) {
    return this.request<{
      id: number;
      bank_name: string;
      account_id: string;
      status: string;
      last_synced_at: string | null;
      created_at: string;
      metadata: Record<string, any>;
    }>("/accounts/link", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listAccounts() {
    return this.request<
      Array<{
        id: number;
        bank_name: string;
        account_id: string;
        status: string;
        last_synced_at: string | null;
        created_at: string;
        metadata: Record<string, any>;
      }>
    >("/accounts");
  }

  async unlinkAccount(accountId: number) {
    return this.request<{ message: string }>(`/accounts/${accountId}`, {
      method: "DELETE",
    });
  }

  async syncAccount(accountId: number) {
    return this.request<{ message: string; last_synced_at: string }>(
      `/accounts/${accountId}/sync`,
      {
        method: "POST",
      }
    );
  }

  // Open Banking endpoints (consent → authorize → fetch-transactions)
  async createOpenBankingConsent(options?: {
    permissions?: string[];
    expiration_days?: number;
  }) {
    return this.request<{
      consent_id: string;
      status: string;
      authorization_url: string | null;
      provider_mode: string;
      is_sandbox: boolean;
    }>("/open-banking/consent", {
      method: "POST",
      body: JSON.stringify({
        permissions: options?.permissions ?? [
          "ReadAccountsBasic",
          "ReadTransactionsBasic",
          "ReadTransactionsCredits",
          "ReadTransactionsDebits",
        ],
        expiration_days: options?.expiration_days ?? 90,
      }),
    });
  }

  async listOpenBankingAccounts() {
    return this.request<{
      accounts: Array<{
        id: number;
        bank_name: string;
        account_id: string;
        status: string;
        consent_id: string | null;
        provider_mode: string;
        is_sandbox: boolean;
      }>;
    }>("/open-banking/accounts");
  }

  /** Use for Open Banking–linked accounts; runs fetch + forensics. Do not use syncAccount for OB accounts. */
  async fetchOpenBankingTransactions(accountId: number) {
    return this.request<{
      job_id: string;
      status: string;
      message: string;
    }>(`/open-banking/fetch-transactions?account_id=${encodeURIComponent(accountId)}`, {
      method: "POST",
    });
  }

  async getOpenBankingConsent(consentId: string) {
    return this.request<Record<string, unknown>>(`/open-banking/consent/${consentId}`);
  }

  async getJob(jobId: string) {
    return this.request<{
      job_id: string;
      type: string;
      status: "pending" | "running" | "succeeded" | "failed" | string;
      result: Record<string, unknown> | null;
      error: string | null;
      created_at: string;
      started_at: string | null;
      finished_at: string | null;
    }>(`/jobs/${encodeURIComponent(jobId)}`, {}, 10000);
  }

  // Admin endpoints
  async getOverviewStats() {
    return this.request<{
      total_users: number;
      active_users: number;
      total_linked_accounts: number;
      total_transactions: number;
      total_analyses: number;
      average_health_score: number;
      total_frozen_items: number;
      total_capital_protected: number;
      active_consents: number;
      ml_anomalies_detected: number;
      mailbox_effect_prevalence: number;
      avg_inclusion_score: number;
      retail_wealth_unlock: number;
      avg_inclusion_delta: number;
      total_retail_velocity: number;
    }>("/admin/stats/overview", {}, 30000); // 30s timeout for stats endpoints
  }

  async getRegionalStats() {
    return this.request<
      Array<{
        region: string;
        average_health_score: number;
        total_leaks: number;
        total_users: number;
        top_leak_type: string;
      }>
    >("/admin/stats/regional", {}, 30000); // 30s timeout for stats endpoints
  }

  async getTemporalStats(days: number = 30) {
    return this.request<{
      period_days: number;
      start_date: string;
      end_date: string;
      total_analyses: number;
      temporal_data: Array<{
        date: string;
        average_score: number;
        count: number;
      }>;
    }>(`/admin/stats/temporal?days=${days}`, {
      method: "GET",
    }, 30000); // 30s timeout for stats endpoints
  }

  async getMLFindings() {
    return this.request<{
      top_leak_categories: Array<{
        category: string;
        count: number;
        growth: string;
      }>;
      anomaly_distribution: {
        high_risk: number;
        medium_risk: number;
        low_risk: number;
      };
      predicted_savings_next_month: number;
    }>("/admin/stats/ml-findings", {}, 30000);
  }

  async getProviderHealth() {
    return this.request<{
      status: string;
      checks: Record<string, { status: string; detail?: string }>;
    }>("/health/providers", {}, 30000);
  }

  async listUsers(skip: number = 0, limit: number = 50) {
    return this.request<{
      users: Array<{
        id: string;
        full_name: string | null;
        role: string;
        created_at: string;
      }>;
      total: number;
      skip: number;
      limit: number;
    }>(`/admin/users?skip=${skip}&limit=${limit}`);
  }

  // Provisioning -- none of admin/investor/partner have self-service signup,
  // so this is the only way to create one of those accounts.
  async provisionUser(data: {
    email: string;
    role: "user" | "admin" | "investor" | "partner";
  }) {
    return this.request<{
      id: string;
      email: string;
      role: string;
    }>("/admin/provision-user", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAuditLog(options?: { limit?: number; skip?: number; eventType?: string }) {
    const params = new URLSearchParams();
    params.set("limit", String(options?.limit ?? 50));
    params.set("skip", String(options?.skip ?? 0));
    if (options?.eventType) {
      params.set("event_type", options.eventType);
    }
    return this.request<
      Array<{
        id: number;
        event_type: string;
        actor_user_id: string | null;
        actor_name: string | null;
        target_user_id: string | null;
        target_name: string | null;
        ip_address: string | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>
    >(`/admin/audit-log?${params.toString()}`);
  }

  async getForensicFeed(limit: number = 50) {
    return this.request<
      Array<{
        id: string;
        user_id: string;
        username: string;
        score: number;
        band: string;
        created_at: string;
        transaction_count: number;
        leaks: Array<{
          type: string;
          severity: string;
          impact: number;
          name_xhosa: string;
        }>;
        inclusion_delta: number;
        retail_velocity: number;
        summary: string;
        open_banking_verified: boolean;
      }>
    >(`/admin/forensic-feed?limit=${limit}`);
  }

  async exportAnalysisPdf(analysisId: string) {
    const url = `${this.baseUrl}${API_VERSION_PREFIX}/admin/analysis/${encodeURIComponent(analysisId)}/export.pdf`;

    const response = await fetch(url, {
      headers: await getAuthHeaders(),
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Failed to export PDF: HTTP ${response.status}`);
    }
    return response.blob();
  }

  async requestAnalysisFollowUp(analysisId: string, note: string = "") {
    return this.request<{
      status: string;
      analysis_id: number;
      message: string;
    }>(`/admin/analysis/${encodeURIComponent(analysisId)}/follow-up`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  }

  async syncAllData() {
    // sync-all returns immediately (background task), so default timeout is fine
    return this.request<{ status: string, message: string }>("/admin/sync-all", {
      method: "POST"
    });
  }

  // Mobile endpoints
  async freezeLeak(data: {
    leak_id?: string;
    transaction_id?: string;
    consent_id?: string;
    reason?: string;
  }) {
    return this.request<{
      status: string;
      message: string;
      frozen_item_id: number | null;
    }>("/mobile/freeze", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listFrozen() {
    return this.request<
      Array<{
        id: number;
        leak_id: string | null;
        transaction_id: string | null;
        consent_id: string | null;
        reason: string;
        frozen_at: string;
        status: string;
      }>
    >("/mobile/frozen");
  }

  // ML endpoints
  async detectAnomalies(limit: number = 1000) {
    return this.request<{
      anomalies: string[];
      anomaly_scores: Record<string, number>;
      anomaly_count: number;
      total_transactions: number;
    }>("/ml/detect-anomalies", {
      method: "POST",
      body: JSON.stringify({ limit }),
    });
  }

  async getUserCluster() {
    return this.request<{
      cluster_id: number;
      cluster_profile: string;
      features?: {
        avg_transaction_amount: number;
        transactions_per_day: number;
      };
    }>("/ml/user-cluster");
  }
}

export const apiClient = new ApiClient();

