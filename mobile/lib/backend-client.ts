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
 * Auth: getAuthToken() returns the stored backend JWT first, then the Supabase session token.
 * After backend login, call setBackendAuthToken(access_token). On logout, call clearBackendAuthToken().
 *
 * See docs/ARCHITECTURE.md for frontend–backend linkage and Open Banking (other team member).
 */

import { getBackendToken, setBackendToken } from "./auth-storage";
import { supabase } from "./supabase";

const BACKEND_BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export interface BackendApiError {
  detail: string;
}

/** Re-export for callers that need to set/clear the backend JWT after login/logout. */
export { setBackendToken as setBackendAuthToken, clearBackendToken as clearBackendAuthToken } from "./auth-storage";

/**
 * Returns the JWT to send to the backend (Bearer token).
 * 1. Stored backend token (from setBackendAuthToken after POST /auth/login).
 * 2. Current Supabase session access_token (for when backend supports Supabase JWT).
 */
async function getAuthToken(): Promise<string | null> {
  const stored = await getBackendToken();
  if (stored) return stored;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BACKEND_BASE_URL}${path}`;
  const token = await getAuthToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (e) {
    const msg =
      e instanceof TypeError && e.message === "Network request failed"
        ? "Can't reach the backend. If you're on a phone or Android emulator, set EXPO_PUBLIC_BACKEND_URL in mobile/.env to your PC's IP (e.g. http://192.168.1.x:8001) or use http://10.0.2.2:8001 for the emulator, then restart Expo."
        : e instanceof Error
          ? e.message
          : "Network request failed";
    throw new Error(msg);
  }

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
// Auth (backend login – store JWT for subsequent requests)
// ---------------------------------------------------------------------------

export interface BackendLoginResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  role: string;
}

/** Call after user signs in with email/password. Stores the JWT so all backend requests are authenticated. */
export async function loginWithBackend(
  email: string,
  password: string
): Promise<BackendLoginResponse> {
  const url = `${BACKEND_BASE_URL}/auth/login`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const err: BackendApiError = await response.json().catch(() => ({
      detail: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(err.detail || "Login failed");
  }
  const data = (await response.json()) as BackendLoginResponse;
  await setBackendToken(data.access_token);
  return data;
}

/** Call after user signs up. Creates account and stores the JWT. */
export async function registerWithBackend(
  email: string,
  password: string
): Promise<BackendLoginResponse> {
  const url = `${BACKEND_BASE_URL}/auth/register`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const err: BackendApiError = await response.json().catch(() => ({
      detail: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(err.detail || "Registration failed");
  }
  const data = (await response.json()) as BackendLoginResponse;
  await setBackendToken(data.access_token);
  return data;
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
      permissions: body.permissions ?? [
        "ReadAccountsBasic",
        "ReadTransactionsBasic",
        "ReadTransactionsCredits",
        "ReadTransactionsDebits",
      ],
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

// ---------------------------------------------------------------------------
// Interactive voice chat (Groq via backend – API key stays on server)
// ---------------------------------------------------------------------------

export interface VoiceChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface VoiceChatRequest {
  messages: VoiceChatMessage[];
  language?: string;
  summary_context?: string;
}

export interface VoiceChatResponse {
  message: string;
}

export async function voiceChat(body: VoiceChatRequest): Promise<VoiceChatResponse> {
  return request("/voice/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: body.messages,
      language: body.language ?? "en",
      summary_context: body.summary_context ?? undefined,
    }),
  });
}
