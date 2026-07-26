import * as SecureStore from "expo-secure-store";

const BACKEND_TOKEN_KEY = "tracepay_backend_access_token";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export function getBackendToken(): Promise<string | null> {
  return SecureStore.getItemAsync(BACKEND_TOKEN_KEY, OPTIONS);
}

export function setBackendToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(BACKEND_TOKEN_KEY, token, OPTIONS);
}

export function clearBackendToken(): Promise<void> {
  return SecureStore.deleteItemAsync(BACKEND_TOKEN_KEY, OPTIONS);
}
