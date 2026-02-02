const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

export interface ApiError {
  detail: string;
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private pendingRequests = new Map<string, Promise<any>>();

  constructor(baseUrl: string = API_BASE_URL) {
    // Force IPv4 loopback in browser to avoid ::1 preference
    let finalBase = baseUrl;
    if (typeof window !== "undefined" && finalBase.includes("localhost")) {
      finalBase = finalBase.replace("localhost", "127.0.0.1");
    }
    this.baseUrl = finalBase.endsWith("/") ? finalBase.slice(0, -1) : finalBase;

    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("auth_token");
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("auth_token", token);
      } else {
        localStorage.removeItem("auth_token");
      }
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 15000 // Make timeout configurable
  ): Promise<T> {
    // Normalize endpoint
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    // Create a unique key for this request (include timeout in key to allow different timeouts for same endpoint)
    const requestKey = `${options.method || "GET"}:${url}:${timeoutMs}`;

    // If there's already a pending request for this endpoint, return it
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> ?? {}),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

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
          throw new Error(errorData.detail || "API request failed");
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
            `→ Check NEXT_PUBLIC_API_URL in .env.local / Vercel\n` +
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

  // Auth endpoints
  // In web/dashboard/lib/api.ts - Update user_id types:

  async register(email: string, password: string) {
    const response = await this.request<{
      access_token: string;
      user_id: string;  // Changed from number to string
      email: string;
      role: string;
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.setToken(response.access_token);
    return response;
  }

  async login(email: string, password: string) {
    const response = await this.request<{
      access_token: string;
      user_id: string;  // Changed from number to string
      email: string;
      role: string;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.setToken(response.access_token);
    return response;
  }

  async getMe() {
    return this.request<{
      id: string;  // Changed from number to string
      email: string;
      role: string;
      created_at: string;
    }>("/auth/me");
  }

  async refreshToken() {
    const response = await this.request<{
      access_token: string;
      user_id: string;  // Changed from number to string
      email: string;
      role: string;
    }>("/auth/refresh", {
      method: "POST",
    });
    this.setToken(response.access_token);
    return response;
  }

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
      }>;
    }>("/open-banking/accounts");
  }

  /** Use for Open Banking–linked accounts; runs fetch + forensics. Do not use syncAccount for OB accounts. */
  async fetchOpenBankingTransactions(accountId: number) {
    return this.request<{
      status: string;
      message: string;
      account_id: number;
      new_transactions: number;
      total_monitored: number;
      health_score: number | null;
    }>(`/open-banking/fetch-transactions?account_id=${encodeURIComponent(accountId)}`, {
      method: "POST",
    });
  }

  async getOpenBankingConsent(consentId: string) {
    return this.request<Record<string, unknown>>(`/open-banking/consent/${consentId}`);
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

  async listUsers(skip: number = 0, limit: number = 50) {
    return this.request<{
      users: Array<{
        id: string;
        email: string;
        role: string;
        created_at: string;
        is_active: boolean;
      }>;
      total: number;
      skip: number;
      limit: number;
    }>(`/admin/users?skip=${skip}&limit=${limit}`);
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
      }>
    >(`/admin/forensic-feed?limit=${limit}`);
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

