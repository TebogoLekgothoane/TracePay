import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Fingerprint, Lock, ScanFace } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TracePayIcon from "../../assets/icons/assembled TracePay icon.svg";
import { PinUnlockSheet } from "../../src/components/auth/PinUnlockSheet";
import { Button } from "../../src/components/ui/Button";
import { FALLBACK_PROFILE_NAME } from "../../src/features/auth/auth.constants";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import { formatLockoutRemaining } from "../../src/features/security/pin-attempts";
import {
  initialUnlockState,
  isPinSheetVisible,
  unlockReducer,
} from "../../src/features/security/unlock.machine";
import { useProfile } from "../../src/hooks/useProfile";
import { COLORS } from "../../src/theme/colors";

function unlockGreeting(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim() ?? "";
  if (!trimmed || trimmed === FALLBACK_PROFILE_NAME) {
    return "Welcome back";
  }

  return `Welcome back, ${trimmed.split(/\s+/)[0]}`;
}

export default function UnlockScreen() {
  const {
    authenticateWithBiometrics,
    biometricAvailability,
    biometricsEnabled,
    isHydrated,
    pinLockedUntil,
    verifyPin,
  } = useAppLock();
  const { profile } = useProfile();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = COLORS[isDark ? "dark" : "light"];

  const [state, dispatch] = useReducer(unlockReducer, initialUnlockState);
  const [now, setNow] = useState(() => Date.now());
  const mountedRef = useRef(true);
  const authenticateRef = useRef(authenticateWithBiometrics);
  authenticateRef.current = authenticateWithBiometrics;

  const canUseBiometrics =
    biometricsEnabled &&
    biometricAvailability.available &&
    biometricAvailability.kind !== null;
  const biometricLabel = biometricAvailability.label ?? "Biometrics";
  const biometricKind = canUseBiometrics ? biometricAvailability.kind : null;

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

  // Decide the first step once lock state has loaded: biometrics first when
  // enrolled, otherwise straight to the PIN sheet.
  useEffect(() => {
    if (!isHydrated || state.phase !== "starting") {
      return;
    }
    dispatch({ type: "START", canUseBiometrics, lockedUntil: pinLockedUntil });
  }, [canUseBiometrics, isHydrated, pinLockedUntil, state.phase]);

  // One OS prompt per request id. The provider also refuses concurrent prompts.
  useEffect(() => {
    if (state.phase !== "biometric" || state.biometricRequestId === 0) {
      return;
    }

    void authenticateRef.current().then((result) => {
      if (!mountedRef.current) {
        return;
      }
      switch (result.status) {
        case "success":
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          dispatch({ type: "BIOMETRIC_SUCCESS" });
          break;
        case "failed":
          dispatch({ type: "BIOMETRIC_FAILED", message: result.message });
          break;
        default:
          dispatch({ type: "BIOMETRIC_UNAVAILABLE", message: result.message });
      }
    });
  }, [state.biometricRequestId, state.phase]);

  useEffect(() => {
    if (state.phase !== "locked_out" || state.lockedUntil === null) {
      return;
    }
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (state.lockedUntil !== null && current >= state.lockedUntil) {
        dispatch({ type: "LOCKOUT_EXPIRED" });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [state.lockedUntil, state.phase]);

  useEffect(() => {
    if (state.phase === "signed_out") {
      router.replace("/(auth)/welcome");
    }
    // On "unlocking" the provider is already unlocked; the root navigator
    // owns the redirect home, so this screen never navigates on success.
  }, [state.phase]);

  const handlePin = useCallback(
    (pin: readonly number[]) => {
      if (state.phase !== "pin") {
        return;
      }
      dispatch({ type: "PIN_SUBMITTED" });

      void verifyPin(pin).then((result) => {
        if (!mountedRef.current) {
          return;
        }
        switch (result.status) {
          case "success":
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            dispatch({ type: "PIN_SUCCESS" });
            break;
          case "incorrect":
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            dispatch({ type: "PIN_INCORRECT", remaining: result.remaining });
            break;
          case "locked":
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setNow(Date.now());
            dispatch({ type: "PIN_LOCKED", until: result.until });
            break;
          case "wiped":
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            dispatch({ type: "PIN_WIPED" });
            break;
        }
      });
    },
    [state.phase, verifyPin],
  );

  const lockoutMessage =
    state.phase === "locked_out" && state.lockedUntil !== null
      ? `Too many incorrect PINs. Try again in ${formatLockoutRemaining(
          Math.max(0, state.lockedUntil - now),
        )}.`
      : null;

  const sheetVisible = isPinSheetVisible(state);
  const statusMessage =
    state.phase === "starting"
      ? "Checking your device…"
      : state.phase === "biometric"
        ? `Waiting for ${biometricLabel}…`
        : state.phase === "unlocking"
          ? "Unlocking…"
          : (state.message ?? "Unlock with your PIN.");

  const resetLink = (
    <Pressable
      accessibilityLabel="Forgot your PIN? Reset it by signing in again"
      accessibilityRole="link"
      disabled={state.phase === "verifying"}
      hitSlop={8}
      onPress={() => router.push("/(auth)/reset-pin")}
      className="flex-row flex-wrap items-center justify-center px-2 active:opacity-70"
    >
      <Text className="text-center text-[14px] text-muted-foreground">
        Forgot your PIN?{" "}
      </Text>
      <Text
        className="text-center text-[14px] font-semibold"
        style={{ color: palette.pinFilled }}
      >
        Reset
      </Text>
    </Pressable>
  );

  const BiometricIcon = biometricKind === "face" ? ScanFace : Fingerprint;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={isDark ? "light" : "dark"} />
      <SafeAreaView className="flex-1">
        <View className="flex-1 items-center px-7 pt-10">
          <TracePayIcon width={64} height={50} />
          <Text className="mt-1 text-[18px] font-bold tracking-[-0.4px] text-foreground">
            TracePay
          </Text>

          <View className="mt-12 items-center">
            <Lock color={palette.foreground} size={18} strokeWidth={2.25} />
            <Text className="mt-4 text-center text-[26px] font-bold leading-[32px] tracking-[-0.7px] text-foreground">
              {greeting}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              className="mt-2 max-w-[320px] text-center text-[15px] leading-[21px] text-muted-foreground"
            >
              {statusMessage}
            </Text>
          </View>

          {canUseBiometrics ? (
            <Pressable
              accessibilityLabel={`Unlock with ${biometricLabel}`}
              accessibilityRole="button"
              disabled={state.phase === "biometric" || state.phase === "unlocking"}
              onPress={() => dispatch({ type: "REQUEST_BIOMETRIC" })}
              className="mt-14 h-24 w-24 items-center justify-center rounded-full bg-primary/10 active:opacity-70"
            >
              <BiometricIcon color={palette.primary} size={44} strokeWidth={1.6} />
            </Pressable>
          ) : null}

          <View className="mt-auto w-full max-w-[360px] gap-3 pb-6">
            <Button
              disabled={state.phase === "unlocking"}
              onPress={() => dispatch({ type: "USE_PIN" })}
              variant="ghost"
            >
              Use PIN
            </Button>
            {resetLink}
          </View>
        </View>
      </SafeAreaView>

      <PinUnlockSheet
        biometricKind={biometricKind}
        biometricLabel={biometricLabel}
        enabled={state.phase === "pin"}
        errorId={state.pinErrorId}
        errorMessage={state.pinError}
        footer={resetLink}
        isVerifying={state.phase === "verifying"}
        lockoutMessage={lockoutMessage}
        onBiometricPress={
          canUseBiometrics ? () => dispatch({ type: "REQUEST_BIOMETRIC" }) : undefined
        }
        onClearError={() => dispatch({ type: "CLEAR_PIN_ERROR" })}
        onComplete={handlePin}
        visible={sheetVisible}
      />
    </View>
  );
}
