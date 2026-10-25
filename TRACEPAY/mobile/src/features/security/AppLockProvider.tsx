import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import { signOut } from "../auth/auth.service";
import { nextBackgroundedAt, shouldLockOnResume } from "./app-lock.policy";
import {
  clearBiometrics,
  enableBiometricsOnDevice,
  getBiometricAvailability,
  loadBiometricsEnabled,
  saveBiometricsEnabled,
  unlockWithBiometrics,
} from "./biometric.service";
import {
  INITIAL_PIN_ATTEMPTS,
  lockoutRemainingMs,
  registerPinFailure,
  type PinAttemptState,
} from "./pin-attempts";
import { isValidPin } from "./pin.crypto";
import {
  clearLegacyPendingPin,
  clearPinAttempts,
  clearPinRecord,
  createPinRecord,
  loadPinAttempts,
  loadPinRecord,
  pinDigitsMatch,
  savePinAttempts,
  savePinRecord,
  verifyPinRecord,
} from "./pin.service";
import { APP_LOCK_TIMEOUT } from "./security.constants";
import type {
  AppLockContextValue,
  BiometricAvailability,
  BiometricUnlockResult,
  PinRecord,
  PinVerifyResult,
} from "./security.types";

const unavailableBiometrics: BiometricAvailability = {
  available: false,
  kind: null,
  label: null,
  unavailableReason: "unsupported",
};

type AppLockProviderValue = AppLockContextValue & {
  /** Binds a legacy PIN to the signed-in user, or clears another user's PIN. */
  reconcilePinOwner: (userId: string) => Promise<void>;
};

const AppLockContext = createContext<AppLockProviderValue | null>(null);

/**
 * The single authority for local app-lock state. Screens never decide on
 * their own that the app is unlocked: they call verifyPin /
 * authenticateWithBiometrics (or unlockApp after a server-verified sign-in)
 * and the root navigator reacts to `isLocked`.
 */
export function AppLockProvider({ children }: PropsWithChildren): ReactElement {
  const [isHydrated, setIsHydrated] = useState(false);
  const [pinRecord, setPinRecord] = useState<PinRecord | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricAvailability, setBiometricAvailability] =
    useState<BiometricAvailability>(unavailableBiometrics);
  const [attempts, setAttempts] =
    useState<PinAttemptState>(INITIAL_PIN_ATTEMPTS);

  // The PIN being created lives only in memory, never in storage.
  const pendingPinRef = useRef<number[] | null>(null);
  const pinRecordRef = useRef<PinRecord | null>(null);
  const attemptsRef = useRef<PinAttemptState>(INITIAL_PIN_ATTEMPTS);
  const pinQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const biometricInFlightRef = useRef<Promise<BiometricUnlockResult> | null>(
    null,
  );
  const appStateRef = useRef<AppStateStatus>((AppState.currentState ?? "active") as AppStateStatus);
  const backgroundedAtRef = useRef<number | null>(null);

  const applyPinRecord = useCallback((record: PinRecord | null) => {
    pinRecordRef.current = record;
    setPinRecord(record);
  }, []);

  const applyAttempts = useCallback((next: PinAttemptState) => {
    attemptsRef.current = next;
    setAttempts(next);
  }, []);

  const setLocked = useCallback((locked: boolean) => {
    setIsLocked(locked);
  }, []);

  useEffect(() => {
    let active = true;

    void Promise.all([
      loadPinRecord().catch(() => null),
      loadBiometricsEnabled().catch(() => false),
      getBiometricAvailability(),
      loadPinAttempts().catch(() => INITIAL_PIN_ATTEMPTS),
      clearLegacyPendingPin().catch(() => undefined),
    ]).then(([storedPin, storedBiometrics, availability, storedAttempts]) => {
      if (!active) {
        return;
      }

      applyPinRecord(storedPin);
      applyAttempts(storedAttempts);
      setBiometricsEnabled(storedPin !== null && storedBiometrics);
      setBiometricAvailability(availability);
      // Every cold start with a PIN begins locked.
      setLocked(storedPin !== null);
      setIsHydrated(true);
    });

    return () => {
      active = false;
    };
  }, [applyAttempts, applyPinRecord, setLocked]);

  const refreshBiometricAvailability = useCallback(async () => {
    setBiometricAvailability(await getBiometricAvailability());
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      const now = Date.now();
      const backgroundedAt = backgroundedAtRef.current;

      if (
        nextState === "active" &&
        previousState !== "active" &&
        shouldLockOnResume({
          hasPin: pinRecordRef.current !== null,
          backgroundedAt,
          now,
          timeoutMs: APP_LOCK_TIMEOUT,
        })
      ) {
        setLocked(true);
      }

      backgroundedAtRef.current = nextBackgroundedAt(
        previousState,
        nextState,
        backgroundedAt,
        now,
      );
      appStateRef.current = nextState;

      if (nextState === "active" && previousState !== "active") {
        void refreshBiometricAvailability();
      }
    });

    return () => subscription.remove();
  }, [refreshBiometricAvailability, setLocked]);

  const clearDeviceLock = useCallback(async () => {
    pendingPinRef.current = null;
    await Promise.all([
      clearPinRecord(),
      clearPinAttempts(),
      clearBiometrics(),
      clearLegacyPendingPin(),
    ]);
    applyPinRecord(null);
    applyAttempts(INITIAL_PIN_ATTEMPTS);
    setBiometricsEnabled(false);
    setLocked(true);
  }, [applyAttempts, applyPinRecord, setLocked]);

  const preparePin = useCallback(async (pin: readonly number[]) => {
    if (!isValidPin(pin)) {
      throw new Error("Invalid PIN.");
    }
    pendingPinRef.current = [...pin];
  }, []);

  const confirmPin = useCallback(
    async (pin: readonly number[], userId: string | null) => {
      const pending = pendingPinRef.current;
      if (!pending || !pinDigitsMatch(pin, pending)) {
        return false;
      }

      // Persist before unlocking: a PIN that failed to save must not leave
      // the app running unprotected.
      const record = await createPinRecord(pin, userId);
      await savePinRecord(record);
      await clearPinAttempts();
      pendingPinRef.current = null;
      applyPinRecord(record);
      applyAttempts(INITIAL_PIN_ATTEMPTS);
      setLocked(false);
      return true;
    },
    [applyAttempts, applyPinRecord, setLocked],
  );

  const verifyPin = useCallback(
    (pin: readonly number[]): Promise<PinVerifyResult> => {
      // Serialise verifications so rapid submissions cannot race the counter.
      const run = async (): Promise<PinVerifyResult> => {
        const record = pinRecordRef.current;
        if (!record) {
          return { status: "wiped" };
        }

        const now = Date.now();
        const current = attemptsRef.current;
        if (lockoutRemainingMs(current, now) > 0 && current.lockedUntil) {
          return { status: "locked", until: current.lockedUntil };
        }

        const matches = await verifyPinRecord(pin, record).catch(() => false);
        if (matches) {
          applyAttempts(INITIAL_PIN_ATTEMPTS);
          await clearPinAttempts().catch(() => undefined);
          setLocked(false);
          return { status: "success" };
        }

        const { state, outcome } = registerPinFailure(current, Date.now());
        applyAttempts(state);
        await savePinAttempts(state).catch(() => undefined);

        if (outcome.kind === "wipe") {
          await signOut().catch(() => undefined);
          await clearDeviceLock().catch(() => undefined);
          return { status: "wiped" };
        }
        if (outcome.kind === "locked") {
          return { status: "locked", until: outcome.until };
        }
        return { status: "incorrect", remaining: outcome.remaining };
      };

      const result = pinQueueRef.current.then(run, run);
      pinQueueRef.current = result.catch(() => undefined);
      return result;
    },
    [applyAttempts, clearDeviceLock, setLocked],
  );

  const enableBiometrics = useCallback(async () => {
    const result = await enableBiometricsOnDevice();
    if (result.enabled) {
      setBiometricsEnabled(true);
    }
    await refreshBiometricAvailability();
    return result;
  }, [refreshBiometricAvailability]);

  const disableBiometrics = useCallback(async () => {
    await clearBiometrics();
    await saveBiometricsEnabled(false);
    setBiometricsEnabled(false);
  }, []);

  const authenticateWithBiometrics = useCallback(() => {
    if (biometricInFlightRef.current) {
      return biometricInFlightRef.current;
    }

    const label = biometricAvailability.label ?? "Biometrics";
    const attempt = (async (): Promise<BiometricUnlockResult> => {
      if (!biometricsEnabled || pinRecordRef.current === null) {
        return {
          status: "unavailable",
          message: "Enter your PIN to unlock TracePay.",
        };
      }

      const result = await unlockWithBiometrics(label);
      if (result.status === "success") {
        setLocked(false);
      } else if (result.status === "invalidated") {
        await disableBiometrics().catch(() => undefined);
      }
      return result;
    })().finally(() => {
      biometricInFlightRef.current = null;
    });

    biometricInFlightRef.current = attempt;
    return attempt;
  }, [biometricAvailability.label, biometricsEnabled, disableBiometrics, setLocked]);

  const lockApp = useCallback(() => {
    if (pinRecordRef.current) {
      setLocked(true);
    }
  }, [setLocked]);

  /**
   * Only for callers that just completed server-verified sign-in (see
   * continueAfterAuth). PIN and biometric success unlock internally.
   */
  const unlockApp = useCallback(() => {
    setLocked(false);
  }, [setLocked]);

  const reconcilePinOwner = useCallback(
    async (userId: string) => {
      const record = pinRecordRef.current;
      if (!record) {
        return;
      }
      if (record.userId && record.userId !== userId) {
        // Never hand another account's lock state to this session: require
        // a full sign-in, after which the user creates their own PIN.
        await signOut().catch(() => undefined);
        await clearDeviceLock();
        return;
      }
      if (!record.userId) {
        const bound = { ...record, userId };
        await savePinRecord(bound);
        applyPinRecord(bound);
      }
    },
    [applyPinRecord, clearDeviceLock],
  );

  const pinLockedUntil =
    attempts.lockedUntil !== null && attempts.lockedUntil > Date.now()
      ? attempts.lockedUntil
      : null;

  const value = useMemo<AppLockProviderValue>(
    () => ({
      isHydrated,
      hasPin: pinRecord !== null,
      pinOwnerId: pinRecord?.userId ?? null,
      isLocked,
      biometricsEnabled,
      biometricAvailability,
      pinLockedUntil,
      preparePin,
      confirmPin,
      verifyPin,
      enableBiometrics,
      disableBiometrics,
      authenticateWithBiometrics,
      refreshBiometricAvailability,
      lockApp,
      unlockApp,
      clearDeviceLock,
      reconcilePinOwner,
    }),
    [
      authenticateWithBiometrics,
      biometricAvailability,
      biometricsEnabled,
      clearDeviceLock,
      confirmPin,
      disableBiometrics,
      enableBiometrics,
      isHydrated,
      isLocked,
      lockApp,
      pinLockedUntil,
      pinRecord,
      preparePin,
      reconcilePinOwner,
      refreshBiometricAvailability,
      unlockApp,
      verifyPin,
    ],
  );

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockProviderValue {
  const value = useContext(AppLockContext);
  if (!value) {
    throw new Error("useAppLock must be used within AppLockProvider.");
  }
  return value;
}

