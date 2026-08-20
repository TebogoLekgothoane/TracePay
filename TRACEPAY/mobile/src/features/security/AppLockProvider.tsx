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
  getBiometricAvailability,
  loadBiometricsEnabled,
  saveBiometricsEnabled,
} from "./biometric.service";
import { APP_LOCK_TIMEOUT } from "./security.constants";
import {
  createPinRecord,
  loadPinRecord,
  savePinRecord,
  verifyPinRecord,
} from "./pin.service";
import type {
  AppLockContextValue,
  BiometricAvailability,
  PinRecord,
} from "./security.types";

const unavailableBiometrics: BiometricAvailability = {
  available: false,
  kind: null,
  label: null,
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: PropsWithChildren): ReactElement {
  const [isHydrated, setIsHydrated] = useState(false);
  const [pinRecord, setPinRecord] = useState<PinRecord | null>(null);
  const [pendingPinRecord, setPendingPinRecord] = useState<PinRecord | null>(
    null,
  );
  const [isLocked, setIsLocked] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricAvailability, setBiometricAvailability] =
    useState<BiometricAvailability>(unavailableBiometrics);

  const hasPinRef = useRef(false);
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
          setIsLocked(true);
        }
        backgroundedAtRef.current = null;
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  const preparePin = useCallback(async (pin: readonly number[]) => {
    setPendingPinRecord(await createPinRecord(pin));
  }, []);

  const confirmPin = useCallback(
    async (pin: readonly number[]) => {
      if (!pendingPinRecord) {
        return false;
      }

      const matches = await verifyPinRecord(pin, pendingPinRecord);
      if (!matches) {
        return false;
      }

      await savePinRecord(pendingPinRecord);
      setPinRecord(pendingPinRecord);
      setPendingPinRecord(null);
      hasPinRef.current = true;
      setIsLocked(false);
      return true;
    },
    [pendingPinRecord],
  );

  const verifyPin = useCallback(
    async (pin: readonly number[]) => {
      if (!pinRecord) {
        return false;
      }

      const matches = await verifyPinRecord(pin, pinRecord);
      if (matches) {
        setIsLocked(false);
      }
      return matches;
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
      setIsLocked(false);
    }
    return authenticated;
  }, [biometricAvailability.available, biometricsEnabled]);

  const unlockApp = useCallback(() => {
    setIsLocked(false);
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
    unlockApp,
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
