import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScanFace } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import {
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PIN_LENGTH } from "../../features/security/security.constants";
import type { BiometricKind } from "../../features/security/security.types";
import { COLORS } from "../../theme/colors";
import { Button } from "../ui/Button";

type Props = {
  errorMessage?: string | null;
  resetKey?: number;
  isBusy?: boolean;
  biometricKind?: BiometricKind | null;
  onBiometricPress?: () => void;
  onComplete: (pin: readonly number[]) => Promise<void>;
  onForgotPin: () => void;
  onClearError?: () => void;
};

export function UnlockPinSheet({
  errorMessage,
  resetKey = 0,
  isBusy = false,
  biometricKind = null,
  onBiometricPress,
  onComplete,
  onForgotPin,
  onClearError,
}: Props): ReactElement {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [digits, setDigits] = useState<number[]>([]);
  const submittingRef = useRef(false);
  const shake = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const showBiometric = Boolean(biometricKind && onBiometricPress);

  useEffect(() => {
    if (resetKey === 0) {
      return;
    }

    shake.value = withSequence(
      withTiming(-8, { duration: 55 }),
      withTiming(8, { duration: 70 }),
      withTiming(-5, { duration: 60 }),
      withTiming(0, { duration: 55 }),
    );
    setDigits([]);
    submittingRef.current = false;
  }, [resetKey, shake]);

  const digitsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const submitPin = (next: readonly number[]) => {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    void onComplete(next)
      .catch(() => {
        setDigits([]);
      })
      .finally(() => {
        submittingRef.current = false;
      });
  };

  const addDigit = (digit: number) => {
    if (isBusy || submittingRef.current || digits.length >= PIN_LENGTH) {
      return;
    }

    if (errorMessage) {
      onClearError?.();
    }

    void Haptics.selectionAsync();
    const next = [...digits, digit];
    setDigits(next);

    if (next.length === PIN_LENGTH) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          submitPin(next);
        });
      });
    }
  };

  const removeDigit = () => {
    if (isBusy || submittingRef.current || digits.length === 0) {
      return;
    }

    if (errorMessage) {
      onClearError?.();
    }

    void Haptics.selectionAsync();
    setDigits((current) => current.slice(0, -1));
  };

  return (
    <View
      className="px-6 pt-1"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <Text className="text-center text-2xl font-bold tracking-[-0.6px] text-foreground">
        Enter your PIN
      </Text>
      <Text className="mt-1.5 text-center text-sm leading-5 text-muted-foreground">
        Use your PIN to unlock TracePay
      </Text>

      <Animated.View
        className="mt-6 flex-row justify-center gap-3"
        style={digitsStyle}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => {
          const digit = digits[index];
          const hasError =
            Boolean(errorMessage) && digits.length === PIN_LENGTH;
          const isActive = index === digits.length && digits.length < PIN_LENGTH;

          return (
            <View
              key={index}
              className={`h-[52px] w-[48px] items-center justify-center rounded-[14px] border-[1.5px] bg-transparent ${
                hasError
                  ? "border-destructive"
                  : isActive
                    ? "border-primary"
                    : "border-input-border"
              }`}
            >
              <Text
                className={`text-2xl font-semibold tracking-[0.5px] ${
                  hasError ? "text-destructive" : "text-foreground"
                }`}
              >
                {digit ?? ""}
              </Text>
            </View>
          );
        })}
      </Animated.View>

      <View className="mt-2 h-7 items-center justify-center">
        {isBusy ? (
          <ActivityIndicator color={palette.primary} size="small" />
        ) : (
          <Text
            accessibilityLiveRegion="polite"
            className={`text-[13px] font-medium text-destructive ${
              errorMessage ? "opacity-100" : "opacity-0"
            }`}
          >
            {errorMessage ?? " "}
          </Text>
        )}
      </View>

      <View className="mt-1 w-full flex-row flex-wrap justify-center">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <Pressable
            accessibilityLabel={`${digit}`}
            accessibilityRole="button"
            android_ripple={{ color: "transparent" }}
            className="h-[56px] w-1/3 items-center justify-center active:opacity-50"
            disabled={isBusy}
            key={digit}
            onPress={() => addDigit(digit)}
          >
            <Text className="text-[26px] font-medium text-foreground">
              {digit}
            </Text>
          </Pressable>
        ))}
        <View className="h-[56px] w-1/3" />
        <Pressable
          accessibilityLabel="0"
          accessibilityRole="button"
          android_ripple={{ color: "transparent" }}
          className="h-[56px] w-1/3 items-center justify-center active:opacity-50"
          disabled={isBusy}
          onPress={() => addDigit(0)}
        >
          <Text className="text-[26px] font-medium text-foreground">0</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Delete digit"
          accessibilityRole="button"
          android_ripple={{ color: "transparent" }}
          className="h-[56px] w-1/3 items-center justify-center active:opacity-50"
          disabled={isBusy}
          onPress={removeDigit}
        >
          <Ionicons
            color={palette.mutedForeground}
            name="backspace-outline"
            size={25}
          />
        </Pressable>
      </View>

      {showBiometric ? (
        <Button
          accessibilityLabel="Use Face ID"
          className="mt-1 self-center bg-key-pressed/13"
          disabled={isBusy}
          size="sm"
          variant="muted"
          onPress={onBiometricPress}
        >
          <>
            <ScanFace color={palette.primary} size={20} strokeWidth={2} />
            <Text className="text-sm font-semibold text-primary">
              Use Face ID
            </Text>
          </>
        </Button>
      ) : null}

      <Button
        accessibilityRole="link"
        className="mt-1 self-center"
        disabled={isBusy}
        size="sm"
        variant="ghost"
        onPress={onForgotPin}
      >
        Reset PIN
      </Button>
    </View>
  );
}
