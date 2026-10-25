import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Fingerprint, ScanFace } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PIN_LENGTH } from "../../features/security/security.constants";
import type { BiometricKind } from "../../features/security/security.types";
import { COLORS } from "../../theme/colors";
import { PinDot } from "./PinEntryScreen";

type Props = {
  visible: boolean;
  /** Keypad accepts input only when true. */
  enabled: boolean;
  isVerifying: boolean;
  errorMessage: string | null;
  /** Shown instead of the keypad error while PIN entry is blocked. */
  lockoutMessage: string | null;
  /** Increments on each wrong PIN: shakes and clears the dots. */
  errorId: number;
  biometricKind: BiometricKind | null;
  biometricLabel: string;
  onBiometricPress?: () => void;
  onClearError: () => void;
  onComplete: (pin: readonly number[]) => void;
  footer?: ReactNode;
};

const SHEET_HIDDEN_OFFSET = 640;

/**
 * PIN bottom sheet for the unlock screen. It slides over the unlock screen,
 * which stays visible behind a scrim that swallows touches, and verifies as
 * soon as the last digit is entered.
 */
export function PinUnlockSheet({
  visible,
  enabled,
  isVerifying,
  errorMessage,
  lockoutMessage,
  errorId,
  biometricKind,
  biometricLabel,
  onBiometricPress,
  onClearError,
  onComplete,
  footer,
}: Props): ReactElement {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const [digits, setDigits] = useState<number[]>([]);
  const progress = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    progress.value = visible
      ? withSpring(1, { damping: 22, stiffness: 210, mass: 0.9 })
      : withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
    if (!visible) {
      setDigits([]);
    }
  }, [progress, visible]);

  useEffect(() => {
    if (errorId === 0) {
      return;
    }
    shake.value = withSequence(
      withTiming(-8, { duration: 55 }),
      withTiming(8, { duration: 70 }),
      withTiming(-4, { duration: 60 }),
      withTiming(0, { duration: 55 }),
    );
    setDigits([]);
  }, [errorId, shake]);

  useEffect(() => {
    if (!enabled && !isVerifying) {
      setDigits([]);
    }
  }, [enabled, isVerifying]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.45,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SHEET_HIDDEN_OFFSET }],
  }));

  const dotsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const addDigit = (digit: number) => {
    if (!enabled || digits.length >= PIN_LENGTH) {
      return;
    }
    if (errorMessage) {
      onClearError();
    }

    void Haptics.selectionAsync();
    const next = [...digits, digit];
    setDigits(next);

    if (next.length === PIN_LENGTH) {
      // Let the last dot render before verification starts.
      requestAnimationFrame(() => onComplete(next));
    }
  };

  const removeDigit = () => {
    if (!enabled || digits.length === 0) {
      return;
    }
    void Haptics.selectionAsync();
    setDigits((current) => current.slice(0, -1));
  };

  const keyClass = "h-[62px] w-1/3 items-center justify-center active:opacity-50";
  const showBiometricKey = Boolean(biometricKind && onBiometricPress);

  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      className="absolute inset-0 justify-end"
    >
      <Animated.View
        className="absolute inset-0 bg-black"
        style={scrimStyle}
      />

      <Animated.View
        accessibilityViewIsModal={visible}
        className="rounded-t-[28px] bg-card px-7 pt-3"
        style={[sheetStyle, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <View className="mb-4 h-1 w-10 self-center rounded-full bg-muted" />

        <Text className="text-center text-[20px] font-bold tracking-[-0.4px] text-foreground">
          Enter your TracePay PIN
        </Text>

        <Animated.View
          className="mt-6 flex-row justify-center gap-[22px]"
          style={dotsStyle}
        >
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <PinDot
              emptyColor={
                colorScheme === "dark"
                  ? "rgba(255,255,255,0.22)"
                  : "rgba(148, 163, 184, 0.45)"
              }
              errorColor={palette.destructive}
              filled={index < digits.length}
              filledColor={palette.pinFilled}
              hasError={Boolean(errorMessage) && digits.length === 0}
              index={index}
              key={index}
            />
          ))}
        </Animated.View>

        <View className="mt-3 h-[40px] items-center justify-center px-2">
          {isVerifying ? (
            <ActivityIndicator color={palette.primary} size="small" />
          ) : (
            <Text
              accessibilityLiveRegion="polite"
              className={`text-center text-[13px] font-medium ${
                lockoutMessage ? "text-muted-foreground" : "text-destructive"
              }`}
            >
              {lockoutMessage ?? errorMessage ?? " "}
            </Text>
          )}
        </View>

        <View
          className={`w-full flex-row flex-wrap justify-center self-center ${
            enabled ? "" : "opacity-40"
          }`}
          style={{ maxWidth: 330 }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <Pressable
              accessibilityLabel={`${digit}`}
              accessibilityRole="button"
              android_ripple={{ color: "transparent" }}
              className={keyClass}
              disabled={!enabled}
              key={digit}
              onPress={() => addDigit(digit)}
            >
              <Text className="text-[26px] font-medium text-foreground">
                {digit}
              </Text>
            </Pressable>
          ))}

          {showBiometricKey ? (
            <Pressable
              accessibilityLabel={`Unlock with ${biometricLabel}`}
              accessibilityRole="button"
              android_ripple={{ color: "transparent" }}
              className={keyClass}
              disabled={isVerifying}
              onPress={onBiometricPress}
            >
              {biometricKind === "face" ? (
                <ScanFace color={palette.foreground} size={28} strokeWidth={1.75} />
              ) : (
                <Fingerprint color={palette.foreground} size={28} strokeWidth={1.75} />
              )}
            </Pressable>
          ) : (
            <View className={keyClass} />
          )}

          <Pressable
            accessibilityLabel="0"
            accessibilityRole="button"
            android_ripple={{ color: "transparent" }}
            className={keyClass}
            disabled={!enabled}
            onPress={() => addDigit(0)}
          >
            <Text className="text-[26px] font-medium text-foreground">0</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Delete digit"
            accessibilityRole="button"
            android_ripple={{ color: "transparent" }}
            className={keyClass}
            disabled={!enabled}
            onPress={removeDigit}
          >
            <Ionicons
              color={palette.mutedForeground}
              name="backspace-outline"
              size={25}
            />
          </Pressable>
        </View>

        <View className="mt-2 min-h-[38px] items-center justify-center">
          {footer}
        </View>
      </Animated.View>
    </View>
  );
}
