/** Time in the background after which TracePay requires unlocking again. */
export const APP_LOCK_TIMEOUT = 10_000;

export const PIN_LENGTH = 4;
export const PIN_KDF_ITERATIONS = 40_000;

/** Wrong PINs allowed before delays begin. */
export const PIN_FREE_ATTEMPTS = 5;
/** Delay after each further wrong PIN, in order; the last value repeats. */
export const PIN_LOCKOUT_SCHEDULE_MS = [
  30_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
] as const;
/**
 * Wrong PINs after which the local PIN is wiped and the user must sign in
 * with their phone number and password again.
 */
export const PIN_MAX_ATTEMPTS = 10;

export const SECURITY_STORAGE_KEYS = {
  pinRecord: "tracepay.security.pin-record.v1",
  pinAttempts: "tracepay.security.pin-attempts.v1",
  biometricsEnabled: "tracepay.security.biometrics-enabled.v1",
  biometricSecret: "tracepay.security.biometric-secret.v1",
  /** Legacy plaintext pending PIN; only ever deleted now. */
  legacyPendingPin: "tracepay.security.pending-pin.v1",
} as const;
