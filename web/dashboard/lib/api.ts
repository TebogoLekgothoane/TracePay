const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export interface ApiError {
  detail: string;
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
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
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    };
    
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        detail: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new Error(error.detail || "API request failed");
    }

    return response.json();
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
    }>("/admin/stats/overview");
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
    >("/admin/stats/regional");
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
    }>("/admin/stats/temporal", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async listUsers(skip: number = 0, limit: number = 50) {
    return this.request<{
      users: Array<{
        id: number;
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

