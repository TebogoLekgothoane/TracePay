/**
 * Backend auth token storage for the TracePay mobile app.
 *
 * Use this to persist the JWT so backend-client can send it on every request.
 * - If you use backend login (POST /auth/login): store the access_token here
 *   after login and clear it on logout.
 * - If you use Supabase Auth: the backend-client will also try the current
 *   Supabase session token when no stored backend token is present (once
 *   the backend supports Supabase JWT verification).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_TOKEN_KEY = "@tracepay_backend_token";

export async function getBackendToken(): Promise<string | null> {
  return AsyncStorage.getItem(BACKEND_TOKEN_KEY);
}

export async function setBackendToken(token: string): Promise<void> {
  await AsyncStorage.setItem(BACKEND_TOKEN_KEY, token);
}

export async function clearBackendToken(): Promise<void> {
  await AsyncStorage.removeItem(BACKEND_TOKEN_KEY);
}
