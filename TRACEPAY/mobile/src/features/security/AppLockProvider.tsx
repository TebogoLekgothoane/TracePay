import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  authenticateLocally,
  clearBiometricsEnabled,
  getBiometricAvailability,
  loadBiometricsEnabled,
  saveBiometricsEnabled,
} from "./biometric.service";
import {
  APP_LOCK_TIMEOUT,
  PIN_LENGTH,
  SECURITY_STORAGE_KEYS,
} from "./security.constants";
import {
  clearPinRecord,
  createPinRecord,
  loadPinRecord,
  pinDigitsMatch,
  savePinRecord,
  verifyPinRecord,
} from "./pin.service";
import type {
  AppLockContextValue,
  BiometricAvailability,
  PinRecord,
} from "./security.types";
import { secureStorage } from "../../lib/secure-storage";

const unavailableBiometrics: BiometricAvailability = {
  available: false,
  kind: null,
  label: null,
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: PropsWithChildren): ReactElement {
  const [isHydrated, setIsHydrated] = useState(false);
  const [pinRecord, setPinRecord] = useState<PinRecord | null>(null);
  const [pendingPinDigits, setPendingPinDigits] = useState<number[] | null>(
    null,
  );
  const [isLocked, setIsLocked] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricAvailability, setBiometricAvailability] =
    useState<BiometricAvailability>(unavailableBiometrics);

  const hasPinRef = useRef(false);
  const isLockedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAtRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    void Promise.all([
      loadPinRecord().catch(() => null),
      loadBiometricsEnabled().catch(() => false),
      getBiometricAvailability().catch(() => unavailableBiometrics),
    ]).then(([storedPinRecord, storedBiometricsEnabled, availability]) => {
      if (!active) {
        return;
      }

      hasPinRef.current = storedPinRecord !== null;
      isLockedRef.current = storedPinRecord !== null;
      setPinRecord(storedPinRecord);
      setBiometricsEnabled(storedBiometricsEnabled);
      setBiometricAvailability(availability);
      setIsLocked(storedPinRecord !== null);
      setIsHydrated(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;

      if (previousState === "active" && nextState !== "active") {
        backgroundedAtRef.current = Date.now();
      }

      if (nextState === "active" && previousState !== "active") {
        const backgroundedAt = backgroundedAtRef.current;
        if (
          hasPinRef.current &&
          backgroundedAt !== null &&
          Date.now() - backgroundedAt >= APP_LOCK_TIMEOUT
        ) {
          isLockedRef.current = true;
          setIsLocked(true);
        }
        backgroundedAtRef.current = null;
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  const preparePin = useCallback(async (pin: readonly number[]) => {
    const digits = [...pin];
    setPendingPinDigits(digits);
    await secureStorage.set(
      SECURITY_STORAGE_KEYS.pendingPin,
      JSON.stringify(digits),
    );
  }, []);

  const confirmPin = useCallback(
    async (pin: readonly number[]) => {
      let pending = pendingPinDigits;
      if (!pending) {
        const stored = await secureStorage.get(SECURITY_STORAGE_KEYS.pendingPin);
        if (stored) {
          try {
            const parsed: unknown = JSON.parse(stored);
            if (
              Array.isArray(parsed) &&
              parsed.length === PIN_LENGTH &&
              parsed.every(
                (digit) =>
                  typeof digit === "number" &&
                  Number.isInteger(digit) &&
                  digit >= 0 &&
                  digit <= 9,
              )
            ) {
              pending = parsed;
            }
          } catch {
            pending = null;
          }
        }
      }

      if (!pending || !pinDigitsMatch(pin, pending)) {
        return false;
      }

      const confirmed = [...pin];
      setPendingPinDigits(null);
      await secureStorage.remove(SECURITY_STORAGE_KEYS.pendingPin);

      // Unlock and allow navigation immediately; persist verifier in background.
      hasPinRef.current = true;
      isLockedRef.current = false;
      setIsLocked(false);

      void createPinRecord(confirmed)
        .then(async (record) => {
          await savePinRecord(record);
          setPinRecord(record);
        })
        .catch(() => {
          // Keep the in-memory unlock; next cold start will require PIN setup again
          // if persistence failed.
          hasPinRef.current = false;
          setPinRecord(null);
        });

      return true;
    },
    [pendingPinDigits],
  );

  const verifyPin = useCallback(
    async (pin: readonly number[]) => {
      if (!pinRecord) {
        return false;
      }

      return verifyPinRecord(pin, pinRecord);
    },
    [pinRecord],
  );

  const enableBiometrics = useCallback(async () => {
    if (!biometricAvailability.available) {
      return false;
    }

    const authenticated = await authenticateLocally().catch(() => false);
    if (!authenticated) {
      return false;
    }

    await saveBiometricsEnabled(true);
    setBiometricsEnabled(true);
    return true;
  }, [biometricAvailability.available]);

  const skipBiometrics = useCallback(async () => {
    await saveBiometricsEnabled(false);
    setBiometricsEnabled(false);
  }, []);

  const authenticateWithBiometrics = useCallback(async () => {
    if (!biometricsEnabled || !biometricAvailability.available) {
      return false;
    }

    const authenticated = await authenticateLocally().catch(() => false);
    if (authenticated) {
      isLockedRef.current = false;
      setIsLocked(false);
    }
    return authenticated;
  }, [biometricAvailability.available, biometricsEnabled]);

  const lockApp = useCallback(() => {
    if (hasPinRef.current) {
      isLockedRef.current = true;
      setIsLocked(true);
    }
  }, []);

  const unlockApp = useCallback(() => {
    isLockedRef.current = false;
    setIsLocked(false);
  }, []);

  const clearDeviceLock = useCallback(async () => {
    await Promise.all([
      clearPinRecord(),
      clearBiometricsEnabled(),
      secureStorage.remove(SECURITY_STORAGE_KEYS.pendingPin),
    ]);
    setPinRecord(null);
    setPendingPinDigits(null);
    setBiometricsEnabled(false);
    hasPinRef.current = false;
    isLockedRef.current = true;
    setIsLocked(true);
  }, []);

  const value: AppLockContextValue = {
    isHydrated,
    hasPin: pinRecord !== null,
    isLocked,
    biometricsEnabled,
    biometricAvailability,
    preparePin,
    confirmPin,
    verifyPin,
    enableBiometrics,
    skipBiometrics,
    authenticateWithBiometrics,
    lockApp,
    unlockApp,
    clearDeviceLock,
  };

  return (
    <AppLockContext.Provider value={value}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const value = useContext(AppLockContext);
  if (!value) {
    throw new Error("useAppLock must be used within AppLockProvider.");
  }
  return value;
}
