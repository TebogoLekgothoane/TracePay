import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColorScheme } from "nativewind";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import TracePayIcon from "../../../assets/icons/assembled TracePay icon.svg";
import { PIN_LENGTH } from "../../features/security/security.constants";
import { COLORS } from "../../theme/colors";

type Props = {
  title: string;
  subtitle: string;
  onComplete: (pin: readonly number[]) => Promise<void>;
  errorMessage?: string | null;
  resetKey?: number;
  isBusy?: boolean;
  footer?: ReactNode;
  useSystemKeyboard?: boolean;
};

function PinDot({
  filled,
  hasError,
  index,
  filledColor,
  emptyColor,
  errorColor,
}: {
  filled: boolean;
  hasError: boolean;
  index: number;
  filledColor: string;
  emptyColor: string;
  errorColor: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      index * 22,
      withSpring(filled ? 1 : 0, { damping: 14, stiffness: 220 }),
    );
  }, [filled, index, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: hasError
      ? errorColor
      : progress.value > 0.5
        ? filledColor
        : "transparent",
    borderColor: hasError
      ? errorColor
      : progress.value > 0.5
        ? filledColor
        : emptyColor,
    transform: [{ scale: 0.92 + progress.value * 0.12 }],
  }));

  return (
    <Animated.View
      className="h-[14px] w-[14px] rounded-full border-[1.5px] bg-transparent"
      style={animatedStyle}
    />
  );
}

export function PinEntryScreen({
  title,
  subtitle,
  onComplete,
  errorMessage,
  resetKey = 0,
  isBusy = false,
  footer,
  useSystemKeyboard = false,
}: Props): ReactElement {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [digits, setDigits] = useState<number[]>([]);
  const submittingRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const entrance = useSharedValue(0);
  const shake = useSharedValue(0);
  const { height } = useWindowDimensions();
  const compact = height < 740;

  useEffect(() => {
    entrance.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    });
  }, [entrance]);

  useEffect(() => {
    if (!useSystemKeyboard) {
      return;
    }

    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    return () => clearTimeout(focusTimer);
  }, [useSystemKeyboard]);

  useEffect(() => {
    if (resetKey === 0) {
      return;
    }

    shake.value = withSequence(
      withTiming(-7, { duration: 55 }),
      withTiming(7, { duration: 70 }),
      withTiming(-4, { duration: 60 }),
      withTiming(0, { duration: 55 }),
    );
    setDigits([]);
    submittingRef.current = false;

    if (useSystemKeyboard) {
      const refocusTimer = setTimeout(() => {
        inputRef.current?.focus();
      }, 40);
      return () => clearTimeout(refocusTimer);
    }
  }, [resetKey, shake, useSystemKeyboard]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 10 },
      { scale: 0.94 + entrance.value * 0.06 },
    ],
  }));

  const dotsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const submitPin = (next: number[]) => {
    submittingRef.current = true;
    void onComplete(next).catch(() => {
      submittingRef.current = false;
      setDigits([]);
    });
  };

  const addDigit = (digit: number) => {
    if (isBusy || submittingRef.current || digits.length >= PIN_LENGTH) {
      return;
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
    void Haptics.selectionAsync();
    setDigits((current) => current.slice(0, -1));
  };

  const handleSystemChange = (nextValue: string) => {
    if (isBusy || submittingRef.current) {
      return;
    }

    const digitsOnly = nextValue.replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (digitsOnly.length > digits.length) {
      void Haptics.selectionAsync();
    }

    const next = digitsOnly.split("").map((digit) => Number(digit));
    setDigits(next);

    if (next.length === PIN_LENGTH) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          submitPin(next);
        });
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View
        className={`flex-1 items-center px-7 pb-3 ${compact ? "pt-3" : "pt-[26px]"}`}
      >
        <View className="items-center">
          <Animated.View className="items-center justify-center" style={iconStyle}>
            <TracePayIcon width={74} height={64} />
          </Animated.View>
          <Text
            className={`font-bold tracking-[-0.7px] text-foreground ${compact ? "mt-1 text-[26px]" : "mt-3 text-[29px]"}`}
          >
            {title}
          </Text>
          <Text className="mt-2 text-center text-[15px] leading-[21px] text-muted-foreground">
            {subtitle}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            if (useSystemKeyboard) {
              inputRef.current?.focus();
            }
          }}
          className="mt-[26px] min-h-[142px] items-center justify-start"
        >
          <Animated.View className="flex-row gap-[22px]" style={dotsStyle}>
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <PinDot
                emptyColor={palette.border}
                errorColor={palette.destructive}
                filled={index < digits.length}
                filledColor={palette.pinFilled}
                hasError={Boolean(errorMessage) && digits.length === PIN_LENGTH}
                index={index}
                key={index}
              />
            ))}
          </Animated.View>

          {useSystemKeyboard ? (
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              blurOnSubmit={false}
              caretHidden
              contextMenuHidden
              editable={!isBusy}
              keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
              maxLength={PIN_LENGTH}
              onChangeText={handleSystemChange}
              ref={inputRef}
              showSoftInputOnFocus
              className="absolute h-px w-px opacity-[0.01]"
              textContentType="oneTimeCode"
              value={digits.join("")}
            />
          ) : null}

          <View className="mt-2 h-[34px] items-center justify-center">
            {isBusy ? (
              <ActivityIndicator color={palette.primary} size="small" />
            ) : (
              <Text
                accessibilityLiveRegion="polite"
                className={`text-[13px] font-medium text-destructive ${errorMessage ? "" : "opacity-0"}`}
              >
                {errorMessage ?? " "}
              </Text>
            )}
          </View>
        </Pressable>

        {!useSystemKeyboard ? (
          <View className="mt-auto w-full max-w-[330px] flex-row flex-wrap justify-center">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${digit}`}
                android_ripple={{ color: "transparent" }}
                disabled={isBusy}
                key={digit}
                onPress={() => addDigit(digit)}
                className={`w-1/3 items-center justify-center active:opacity-50 ${compact ? "h-[58px]" : "h-[68px]"}`}
              >
                <Text className="text-[26px] font-medium text-foreground">
                  {digit}
                </Text>
              </Pressable>
            ))}
            <View className={`w-1/3 ${compact ? "h-[58px]" : "h-[68px]"}`} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="0"
              android_ripple={{ color: "transparent" }}
              disabled={isBusy}
              onPress={() => addDigit(0)}
              className={`w-1/3 items-center justify-center active:opacity-50 ${compact ? "h-[58px]" : "h-[68px]"}`}
            >
              <Text className="text-[26px] font-medium text-foreground">0</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete digit"
              android_ripple={{ color: "transparent" }}
              disabled={isBusy}
              onPress={removeDigit}
              className={`w-1/3 items-center justify-center active:opacity-50 ${compact ? "h-[58px]" : "h-[68px]"}`}
            >
              <Ionicons
                color={palette.mutedForeground}
                name="backspace-outline"
                size={25}
              />
            </Pressable>
          </View>
        ) : (
          <View className="flex-1" />
        )}

        <View className="mt-1 min-h-[38px] items-center justify-center">
          {footer}
        </View>
      </View>
    </SafeAreaView>
  );
}
