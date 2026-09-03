export type PinRecord = {
  version: 1;
  algorithm: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  verifier: string;
};

export type BiometricKind = "face" | "fingerprint";

export type BiometricAvailability = {
  available: boolean;
  kind: BiometricKind | null;
  label: string | null;
};

export type AppLockContextValue = {
  isHydrated: boolean;
  hasPin: boolean;
  isLocked: boolean;
  biometricsEnabled: boolean;
  biometricAvailability: BiometricAvailability;
  preparePin: (pin: readonly number[]) => Promise<void>;
  confirmPin: (pin: readonly number[]) => Promise<boolean>;
  verifyPin: (pin: readonly number[]) => Promise<boolean>;
  enableBiometrics: () => Promise<boolean>;
  skipBiometrics: () => Promise<void>;
  authenticateWithBiometrics: () => Promise<boolean>;
  unlockApp: () => void;
  clearDeviceLock: () => Promise<void>;
};

