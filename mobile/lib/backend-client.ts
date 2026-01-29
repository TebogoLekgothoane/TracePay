/**
 * Backend API client for the TracePay FastAPI (or Node.js) backend.
 *
 * Use this for:
 * - Open Banking (consent, accounts, transactions) – backend integrates with Open Banking API.
 * - Analysis (POST /analyze with transactions).
 * - Mobile freeze/unfreeze (POST /mobile/freeze, GET /mobile/frozen, etc.).
 *
 * App state (settings, subscriptions, banks, etc.) stays in Supabase via lib/api.ts.
 * Set EXPO_PUBLIC_BACKEND_URL to your deployed backend URL (e.g. https://tracepay-api.example.com).
 *
 * See docs/ARCHITECTURE.md for frontend–backend linkage and Open Banking (other team member).
 */

const BACKEND_BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export interface BackendApiError {
  detail: string;
}

function getAuthToken(): string | null {
  // When mobile uses backend auth, store token (e.g. AsyncStorage) and return here.
  return null;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BACKEND_BASE_URL}${path}`;
  const token = getAuthToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const err: BackendApiError = await response.json().catch(() => ({
      detail: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(err.detail || "Backend request failed");
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function backendHealth(): Promise<{ status: string }> {
  return request("/health");
}

// ---------------------------------------------------------------------------
// Open Banking (backend talks to Open Banking API – integration from other team)
// ---------------------------------------------------------------------------

export interface ConsentRequest {
  permissions?: string[];
  expiration_days?: number;
}

export interface ConsentResponse {
  consent_id: string;
  status: string;
  authorization_url?: string | null;
}

export async function createConsent(
  body: ConsentRequest = {}
): Promise<ConsentResponse> {
  return request("/open-banking/consent", {
    method: "POST",
    body: JSON.stringify({
      permissions: body.permissions ?? ["ReadAccountsBasic", "ReadTransactionsBasic"],
      expiration_days: body.expiration_days ?? 90,
    }),
  });
}

export interface OpenBankingAccount {
  id: number;
  bank_name: string;
  account_id: string;
  status: string;
  consent_id?: string;
}

export async function listOpenBankingAccounts(): Promise<{
  accounts: OpenBankingAccount[];
}> {
  return request("/open-banking/accounts");
}

export async function fetchTransactionsFromBackend(
  accountId: number
): Promise<{ message: string; account_id: number; transactions_count?: number }> {
  return request(
    `/open-banking/fetch-transactions?account_id=${encodeURIComponent(accountId)}`,
    { method: "POST" }
  );
}

// ---------------------------------------------------------------------------
// Mobile freeze (backend records freeze; may integrate with Open Banking revoke)
// ---------------------------------------------------------------------------

export interface FreezeRequest {
  leak_id?: string | null;
  transaction_id?: string | null;
  consent_id?: string | null;
  reason?: string;
}

export interface FreezeResponse {
  status: string;
  message: string;
  frozen_item_id?: number | null;
}

export async function mobileFreeze(body: FreezeRequest): Promise<FreezeResponse> {
  return request("/mobile/freeze", {
    method: "POST",
    body: JSON.stringify({
      leak_id: body.leak_id ?? null,
      transaction_id: body.transaction_id ?? null,
      consent_id: body.consent_id ?? null,
      reason: body.reason ?? "User pressed Freeze in mobile app",
    }),
  });
}

export interface FrozenItemResponse {
  id: number;
  leak_id: string | null;
  transaction_id: string | null;
  consent_id: string | null;
  reason: string;
  frozen_at: string;
  status: string;
}

export async function listFrozen(): Promise<FrozenItemResponse[]> {
  return request("/mobile/frozen");
}

export async function mobileUnfreeze(
  frozenItemId: number
): Promise<{ message: string }> {
  return request(`/mobile/unfreeze/${frozenItemId}`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Analysis (send transactions to backend; returns leaks and health score)
// ---------------------------------------------------------------------------

export interface AnalyzeResponse {
  financial_health_score: number;
  health_band: "green" | "yellow" | "red";
  money_leaks: Array<Record<string, unknown>>;
  summary_plain_language: string;
}

export async function analyzeTransactions(
  transactions: Array<Record<string, unknown>>
): Promise<AnalyzeResponse> {
  return request("/analyze", {
    method: "POST",
    body: JSON.stringify({ transactions }),
  });
}
