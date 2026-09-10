import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ScanFace } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import TracePayIcon from "../../assets/icons/assembled TracePay icon.svg";
import { UnlockPinSheet } from "../../src/components/auth/UnlockPinSheet";
import { resolveAuthenticatedHomeHref } from "../../src/features/auth/auth.navigation";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import type { BiometricKind } from "../../src/features/security/security.types";
import { COLORS } from "../../src/theme/colors";

type BiometricPhase = "authenticating" | "failed" | "fallback";

const FAILURE_TO_SHEET_DELAY_MS = 900;

export default function UnlockScreen() {
  const {
    authenticateWithBiometrics,
    biometricAvailability,
    biometricsEnabled,
    unlockApp,
    verifyPin,
  } = useAppLock();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = COLORS[isDark ? "dark" : "light"];
  const snapPoints = useMemo(() => ["78%"], []);

  const canUseBiometrics =
    biometricsEnabled &&
    biometricAvailability.available &&
    biometricAvailability.kind !== null;

  const [phase, setPhase] = useState<BiometricPhase>(
    canUseBiometrics ? "authenticating" : "fallback",
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinResetKey, setPinResetKey] = useState(0);

  const biometricPromptedRef = useRef(false);
  const unlockFinishedRef = useRef(false);
  const mountedRef = useRef(true);
  const sheetOpenRef = useRef(false);
  const finishAfterDismissRef = useRef(false);
  const sheetRef = useRef<BottomSheetModal>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const biometricShake = useSharedValue(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
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

  const presentPinSheet = useCallback(() => {
    if (!mountedRef.current || unlockFinishedRef.current) {
      return;
    }

    setPhase("fallback");
    setSheetOpen(true);
    sheetOpenRef.current = true;
    requestAnimationFrame(() => {
      sheetRef.current?.present();
    });
  }, []);

  const openPinSheet = useCallback(
    (options?: { animateFailure?: boolean; immediate?: boolean }) => {
      if (!mountedRef.current || unlockFinishedRef.current) {
        return;
      }

      if (sheetOpenRef.current) {
        sheetRef.current?.present();
        return;
      }

      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      const animateFailure = options?.animateFailure ?? false;
      const immediate = options?.immediate ?? false;

      if (animateFailure) {
        setPhase("failed");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        biometricShake.value = withSequence(
          withTiming(-10, { duration: 55 }),
          withTiming(10, { duration: 70 }),
          withTiming(-8, { duration: 60 }),
          withTiming(8, { duration: 60 }),
          withTiming(-4, { duration: 50 }),
          withTiming(0, { duration: 50 }),
        );
      } else {
        setPhase("fallback");
      }

      if (immediate) {
        presentPinSheet();
        return;
      }

      fallbackTimerRef.current = setTimeout(
        () => {
          fallbackTimerRef.current = null;
          presentPinSheet();
        },
        animateFailure ? FAILURE_TO_SHEET_DELAY_MS : 120,
      );
    },
    [biometricShake, presentPinSheet],
  );

  const handleSheetDismiss = useCallback(() => {
    sheetOpenRef.current = false;
    setSheetOpen(false);
    if (finishAfterDismissRef.current) {
      finishAfterDismissRef.current = false;
      finishUnlock();
    }
  }, [finishUnlock]);

  const runBiometrics = useCallback(async () => {
    if (!canUseBiometrics || unlockFinishedRef.current) {
      return false;
    }

    try {
      return await authenticateWithBiometrics();
    } catch {
      return false;
    }
  }, [authenticateWithBiometrics, canUseBiometrics]);

  useEffect(() => {
    if (biometricPromptedRef.current) {
      return;
    }

    biometricPromptedRef.current = true;

    if (!canUseBiometrics) {
      openPinSheet({ immediate: true });
      return;
    }

    void runBiometrics().then((authenticated) => {
      if (!mountedRef.current || unlockFinishedRef.current) {
        return;
      }

      if (authenticated) {
        finishUnlock();
        return;
      }

      openPinSheet({ animateFailure: true });
    });
  }, [canUseBiometrics, finishUnlock, openPinSheet, runBiometrics]);

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
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setPinError("Incorrect PIN");
          setPinResetKey((value) => value + 1);
          return;
        }

        finishAfterDismissRef.current = false;
        finishUnlock();
        sheetRef.current?.dismiss();
      } finally {
        if (mountedRef.current) {
          setIsBusy(false);
        }
      }
    },
    [finishUnlock, verifyPin],
  );

  const handleBiometricRetry = useCallback(async () => {
    if (isBusy || unlockFinishedRef.current) {
      return;
    }

    setIsBusy(true);

    try {
      const authenticated = await runBiometrics();
      if (!mountedRef.current || unlockFinishedRef.current) {
        return;
      }

      if (authenticated) {
        finishAfterDismissRef.current = false;
        finishUnlock();
        sheetRef.current?.dismiss();
      }
    } finally {
      if (mountedRef.current) {
        setIsBusy(false);
      }
    }
  }, [finishUnlock, isBusy, runBiometrics]);

  const biometricKind: BiometricKind =
    biometricAvailability.kind ?? "fingerprint";
  const biometricLabel =
    biometricAvailability.label ??
    (biometricKind === "face" ? "Face ID" : "fingerprint");
  const showFailureCopy = phase === "failed" || phase === "fallback";

  const iconShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: biometricShake.value }],
  }));

  const statusLine = !canUseBiometrics
    ? "Enter your PIN to continue"
    : showFailureCopy
      ? `${biometricLabel} didn't work`
      : `Please look at your screen`;
  const actionLine = !canUseBiometrics
    ? "Unlock with your PIN"
    : showFailureCopy
      ? "Unlock with your PIN"
      : `Authenticating with ${biometricLabel}`;

  return (
    <View className="flex-1 overflow-hidden bg-background">
      <StatusBar style={isDark ? "light" : "dark"} />

      <SafeAreaView className="flex-1">
        <View className="flex-1 items-center px-8 pb-4 pt-6">
          <View className="items-center">
            <TracePayIcon width={58} height={44} />
            <Text className="mt-1 text-[18px] font-bold tracking-[-0.4px] text-foreground">
              TracePay
            </Text>
          </View>

          <View className="flex-1 items-center justify-center">
            <Pressable
              accessibilityLabel={
                showFailureCopy ? "Open PIN entry" : "Retry biometrics"
              }
              accessibilityRole="button"
              onPress={() => {
                if (showFailureCopy || !canUseBiometrics) {
                  openPinSheet({ immediate: true });
                  return;
                }
                void handleBiometricRetry();
              }}
              className="items-center justify-center p-4 active:opacity-90"
            >
              <Animated.View style={iconShakeStyle}>
                <ScanFace color={palette.primary} size={54} strokeWidth={1.75} />
              </Animated.View>
            </Pressable>

            <Text className="mt-10 text-center text-[30px] font-bold tracking-[-0.9px] text-foreground">
              Unlock TracePay
            </Text>
            <Text className="mt-3 text-center text-[15px] leading-[22px] text-muted-foreground">
              {statusLine}
            </Text>
            <Text className="mt-1 text-center text-[15px] leading-[22px] text-muted-foreground">
              {actionLine}
            </Text>

            {showFailureCopy || !canUseBiometrics ? (
              <Pressable
                accessibilityLabel="Unlock with PIN"
                accessibilityRole="button"
                className="mt-8 rounded-full bg-primary/10 px-5 py-3 active:opacity-80"
                onPress={() => openPinSheet({ immediate: true })}
              >
                <Text className="text-[15px] font-semibold text-primary">
                  Unlock with PIN
                </Text>
              </Pressable>
            ) : null}
          </View>

          {sheetOpen ? <View className="min-h-[24px]" /> : null}
        </View>
      </SafeAreaView>

      <BottomSheetModal
        android_keyboardInputMode="adjustResize"
        backdropComponent={(props: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={isDark ? 0.42 : 0.28}
            pressBehavior={isBusy ? "none" : "close"}
          />
        )}
        backgroundStyle={{ backgroundColor: palette.card }}
        enableDynamicSizing={false}
        enablePanDownToClose={!isBusy}
        handleIndicatorStyle={{
          backgroundColor: isDark
            ? "rgba(255,255,255,0.18)"
            : "rgba(23, 24, 45, 0.14)",
        }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onDismiss={handleSheetDismiss}
        ref={sheetRef}
        snapPoints={snapPoints}
      >
        <BottomSheetView className="flex-1">
          <UnlockPinSheet
            biometricKind={canUseBiometrics ? biometricKind : null}
            errorMessage={pinError}
            isBusy={isBusy}
            onBiometricPress={
              canUseBiometrics ? () => void handleBiometricRetry() : undefined
            }
            onClearError={() => setPinError(null)}
            onComplete={handlePin}
            onForgotPin={() => router.replace("/(auth)/reset-pin")}
            resetKey={pinResetKey}
          />
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}
