import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { PinEntryScreen } from "../../src/components/auth/PinEntryScreen";
import { FALLBACK_PROFILE_NAME } from "../../src/features/auth/auth.constants";
import { resolveAuthenticatedHomeHref } from "../../src/features/auth/auth.navigation";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import type { BiometricKind } from "../../src/features/security/security.types";
import { useProfile } from "../../src/hooks/useProfile";
import { COLORS } from "../../src/theme/colors";

function unlockGreeting(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim() ?? "";
  if (!trimmed || trimmed === FALLBACK_PROFILE_NAME) {
    return "Ready when you are.";
  }

  return `Ready when you are, ${trimmed}.`;
}

export default function UnlockScreen() {
  const {
    authenticateWithBiometrics,
    biometricAvailability,
    biometricsEnabled,
    unlockApp,
    verifyPin,
  } = useAppLock();
  const { profile } = useProfile();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = COLORS[isDark ? "dark" : "light"];

  const canUseBiometrics =
    biometricsEnabled &&
    biometricAvailability.available &&
    biometricAvailability.kind !== null;

  const [isBusy, setIsBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinResetKey, setPinResetKey] = useState(0);

  const biometricPromptedRef = useRef(false);
  const unlockFinishedRef = useRef(false);
  const mountedRef = useRef(true);
  const biometricInFlightRef = useRef(false);

  const greeting = useMemo(
    () => unlockGreeting(profile?.fullName),
    [profile?.fullName],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const finishUnlock = useCallback(() => {
    if (unlockFinishedRef.current) {
      return;
    }
    unlockFinishedRef.current = true;
    unlockApp();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void resolveAuthenticatedHomeHref().then((href) => {
      router.replace(href);
    });
  }, [unlockApp]);

  const runBiometrics = useCallback(async () => {
    if (
      !canUseBiometrics ||
      unlockFinishedRef.current ||
      biometricInFlightRef.current
    ) {
      return false;
    }

    biometricInFlightRef.current = true;
    try {
      return await authenticateWithBiometrics();
    } catch {
      return false;
    } finally {
      biometricInFlightRef.current = false;
    }
  }, [authenticateWithBiometrics, canUseBiometrics]);

  useEffect(() => {
    if (biometricPromptedRef.current || !canUseBiometrics) {
      return;
    }

    biometricPromptedRef.current = true;

    void runBiometrics().then((authenticated) => {
      if (!mountedRef.current || unlockFinishedRef.current) {
        return;
      }

      if (authenticated) {
        finishUnlock();
      }
    });
  }, [canUseBiometrics, finishUnlock, runBiometrics]);

  const handlePin = useCallback(
    async (pin: readonly number[]) => {
      if (unlockFinishedRef.current) {
        return;
      }

      setIsBusy(true);
      setPinError(null);

      try {
        const matches = await verifyPin(pin);
        if (!matches) {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error,
          );
          setPinError("Incorrect PIN");
          setPinResetKey((value) => value + 1);
          return;
        }

        finishUnlock();
      } finally {
        if (mountedRef.current) {
          setIsBusy(false);
        }
      }
    },
    [finishUnlock, verifyPin],
  );

  const handleBiometricPress = useCallback(async () => {
    if (isBusy || unlockFinishedRef.current) {
      return;
    }

    setIsBusy(true);
    setPinError(null);

    try {
      const authenticated = await runBiometrics();
      if (!mountedRef.current || unlockFinishedRef.current) {
        return;
      }

      if (authenticated) {
        finishUnlock();
      }
    } finally {
      if (mountedRef.current) {
        setIsBusy(false);
      }
    }
  }, [finishUnlock, isBusy, runBiometrics]);

  const biometricKind: BiometricKind | null = canUseBiometrics
    ? (biometricAvailability.kind ?? null)
    : null;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={isDark ? "light" : "dark"} />
      <PinEntryScreen
        biometricKind={biometricKind}
        errorMessage={pinError}
        footer={
          <Pressable
            accessibilityLabel="Reset PIN"
            accessibilityRole="link"
            disabled={isBusy}
            hitSlop={8}
            onPress={() => router.replace("/(auth)/reset-pin")}
            className="flex-row flex-wrap items-center justify-center px-2 active:opacity-70"
          >
            <Text className="text-center text-[14px] text-muted-foreground">
              Forgot your login PIN?{" "}
            </Text>
            <Text
              className="text-center text-[14px] font-semibold"
              style={{ color: palette.pinFilled }}
            >
              Reset Now
            </Text>
          </Pressable>
        }
        isBusy={isBusy}
        onBiometricPress={
          canUseBiometrics ? () => void handleBiometricPress() : undefined
        }
        onClearError={() => setPinError(null)}
        onComplete={handlePin}
        resetKey={pinResetKey}
        showBrandWordmark
        showLockIcon
        title={greeting}
      />
    </View>
  );
}
