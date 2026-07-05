import AsyncStorage from "@react-native-async-storage/async-storage";

/** All TracePay keys — used for sign-out and account reset. */
export const TRACEPAY_STORAGE_PREFIX = "@tracepay:";

export const AUTH_KEYS = {
  phone: `${TRACEPAY_STORAGE_PREFIX}phone`,
  recoveryEmail: `${TRACEPAY_STORAGE_PREFIX}recoveryEmail`,
  onboardingComplete: `${TRACEPAY_STORAGE_PREFIX}onboardingComplete`,
  name: `${TRACEPAY_STORAGE_PREFIX}name`,
  income: `${TRACEPAY_STORAGE_PREFIX}income`,
  language: `${TRACEPAY_STORAGE_PREFIX}language`,
  voice: `${TRACEPAY_STORAGE_PREFIX}voice`,
  consent: `${TRACEPAY_STORAGE_PREFIX}consent`,
  accounts: `${TRACEPAY_STORAGE_PREFIX}accounts`,
  rewardPoints: `${TRACEPAY_STORAGE_PREFIX}rewardPoints`,
  userId: `${TRACEPAY_STORAGE_PREFIX}userId`,
  biometricEnabled: `${TRACEPAY_STORAGE_PREFIX}biometricEnabled`,
  pinEnabled: `${TRACEPAY_STORAGE_PREFIX}pinEnabled`,
} as const;

export async function clearAllTracePayStorage() {
  const keys = await AsyncStorage.getAllKeys();
  const tracepayKeys = keys.filter((k) => k.startsWith(TRACEPAY_STORAGE_PREFIX));
  if (tracepayKeys.length > 0) {
    await AsyncStorage.multiRemove(tracepayKeys);
  }
}
