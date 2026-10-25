import * as SecureStore from 'expo-secure-store';

export const secureStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};

/**
 * Credential storage: Keychain items readable only while the device is
 * unlocked and never migrated to another device via backup (iOS); Keystore
 * AES-encrypted on Android.
 */
const deviceOnly: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const credentialStorage = {
  get: (key: string) => SecureStore.getItemAsync(key, deviceOnly),
  set: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, deviceOnly),
  remove: (key: string) => SecureStore.deleteItemAsync(key, deviceOnly),
};
