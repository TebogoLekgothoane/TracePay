export const APP_LOCK_TIMEOUT = 10_000;

export const PIN_LENGTH = 4;
export const PIN_KDF_ITERATIONS = 120_000;

export const SECURITY_STORAGE_KEYS = {
  pinRecord: "tracepay.security.pin-record.v1",
  biometricsEnabled: "tracepay.security.biometrics-enabled.v1",
} as const;
