/**
 * Backend auth token and user id storage for the TracePay mobile app.
 *
 * Use this to persist the JWT and user id so backend-client and Supabase
 * API calls use the correct user. Store access_token and user_id after
 * login/register; clear both on logout.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_TOKEN_KEY = "@tracepay_backend_token";
const USER_ID_KEY = "@tracepay_user_id";

export async function getBackendToken(): Promise<string | null> {
  return AsyncStorage.getItem(BACKEND_TOKEN_KEY);
}

export async function setBackendToken(token: string): Promise<void> {
  await AsyncStorage.setItem(BACKEND_TOKEN_KEY, token);
}

export async function clearBackendToken(): Promise<void> {
  await AsyncStorage.removeItem(BACKEND_TOKEN_KEY);
}

export async function getStoredUserId(): Promise<string | null> {
  return AsyncStorage.getItem(USER_ID_KEY);
}

export async function setStoredUserId(userId: string): Promise<void> {
  await AsyncStorage.setItem(USER_ID_KEY, userId);
}

export async function clearStoredUserId(): Promise<void> {
  await AsyncStorage.removeItem(USER_ID_KEY);
}

/** Clear all auth data (token + user id). Call on sign-out. */
export async function clearAuthStorage(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(BACKEND_TOKEN_KEY),
    AsyncStorage.removeItem(USER_ID_KEY),
  ]);
}
