export type PinRecord = {
  version: 1;
  algorithm: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  verifier: string;
  /** Supabase user the PIN was created for; null for legacy records. */
  userId?: string | null;
};

export type BiometricKind = "face" | "fingerprint" | "generic";

export type BiometricUnavailableReason =
  | "no_hardware"
  | "not_enrolled"
  | "weak_only"
  | "unsupported";

export type BiometricAvailability = {
  available: boolean;
  kind: BiometricKind | null;
  label: string | null;
  unavailableReason: BiometricUnavailableReason | null;
};

export type BiometricEnableResult = {
  enabled: boolean;
  message?: string;
};

export type BiometricUnlockResult =
  | { status: "success" }
  /** User cancelled, chose PIN, mismatched or hit an OS lockout. */
  | { status: "failed"; message: string }
  /** Hardware/enrolment no longer usable. */
  | { status: "unavailable"; message: string }
  /** Enrolled biometrics changed: the bound key was invalidated. */
  | { status: "invalidated"; message: string };

export type PinVerifyResult =
  | { status: "success" }
  | { status: "incorrect"; remaining: number }
  | { status: "locked"; until: number }
  /** Too many failures: local unlock wiped, account sign-in required. */
  | { status: "wiped" };

export type AppLockContextValue = {
  isHydrated: boolean;
  hasPin: boolean;
  /** PIN exists but was created for a different Supabase user. */
  pinOwnerId: string | null;
  isLocked: boolean;
  biometricsEnabled: boolean;
  biometricAvailability: BiometricAvailability;
  /** Epoch ms until which PIN entry is blocked, or null. */
  pinLockedUntil: number | null;
  preparePin: (pin: readonly number[]) => Promise<void>;
  confirmPin: (pin: readonly number[], userId: string | null) => Promise<boolean>;
  verifyPin: (pin: readonly number[]) => Promise<PinVerifyResult>;
  enableBiometrics: () => Promise<BiometricEnableResult>;
  disableBiometrics: () => Promise<void>;
  authenticateWithBiometrics: () => Promise<BiometricUnlockResult>;
  refreshBiometricAvailability: () => Promise<void>;
  lockApp: () => void;
  unlockApp: () => void;
  clearDeviceLock: () => Promise<void>;
};
