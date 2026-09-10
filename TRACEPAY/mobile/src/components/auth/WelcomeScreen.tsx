import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import AssembledTracePayIcon from "../../../assets/icons/assembled TracePay icon.svg";
import PayWordmark from "../../../assets/wordmark/PAY.svg";
import TraceWordmark from "../../../assets/wordmark/trace white wordmark.svg";
import { TRACEPAY, withAlpha } from "../../theme/colors";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { TRACEPAY_ICON_COMPOSITION } from "../tracePayIconComposition";
import { continueAfterAuth } from "../../features/auth/auth.navigation";
import { getPendingPhone } from "../../features/auth/auth.service";
import { useAppLock } from "../../features/security/AppLockProvider";
import { useAuth } from "../../hooks/useAuth";
import { WelcomeAuthForm, type WelcomeAuthMode, type WelcomeAuthPayload } from "./WelcomeAuthForm";

const SHEET = {
  duration: 640,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
} as const;

const SHEET_CLOSE = {
  duration: 420,
  easing: Easing.in(Easing.cubic),
} as const;

const SUBTITLE = "Take control of your money.\nFind the leaks. Save your money.";

type Panel = "welcome" | WelcomeAuthMode;

function usePalette() {
  const { colorScheme } = useColorScheme();
  return TRACEPAY[colorScheme === "dark" ? "dark" : "light"];
}

function WelcomeBackdrop({ width, height }: { width: number; height: number }) {
  const palette = usePalette();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const wave = withAlpha(palette.primary, isDark ? 0.42 : 0.2);
  const waveSoft = withAlpha(palette.primary, isDark ? 0.22 : 0.12);
  const waveFaint = withAlpha(palette.primary, isDark ? 0.14 : 0.08);

  return (
    <View
      pointerEvents="none"
      className="bg-background"
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.background }]}
    >
      <LinearGradient
        colors={[
          withAlpha(palette.primary, isDark ? 0.22 : 0.1),
          withAlpha(palette.background, 0),
          withAlpha(palette.primary, isDark ? 0.16 : 0.08),
        ]}
        locations={[0.08, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width={width} height={height}>
        <Path
          d={`M ${-width * 0.18} ${height * 0.18} C ${width * 0.22} ${height * 0.02}, ${width * 0.62} ${height * 0.28}, ${width * 1.18} ${height * 0.12}`}
          fill="none"
          stroke={wave}
          strokeWidth={1.15}
        />
        <Path
          d={`M ${-width * 0.12} ${height * 0.26} C ${width * 0.3} ${height * 0.12}, ${width * 0.72} ${height * 0.36}, ${width * 1.12} ${height * 0.2}`}
          fill="none"
          stroke={waveSoft}
          strokeWidth={1}
        />
        <Path
          d={`M ${-width * 0.2} ${height * 0.68} C ${width * 0.28} ${height * 0.54}, ${width * 0.7} ${height * 0.82}, ${width * 1.2} ${height * 0.64}`}
          fill="none"
          stroke={wave}
          strokeWidth={1.15}
        />
        <Path
          d={`M ${-width * 0.1} ${height * 0.78} C ${width * 0.32} ${height * 0.64}, ${width * 0.76} ${height * 0.92}, ${width * 1.16} ${height * 0.76}`}
          fill="none"
          stroke={waveSoft}
          strokeWidth={1}
        />
        <Path
          d={`M ${-width * 0.16} ${height * 0.88} C ${width * 0.26} ${height * 0.74}, ${width * 0.68} ${height * 0.98}, ${width * 1.22} ${height * 0.86}`}
          fill="none"
          stroke={waveFaint}
          strokeWidth={0.9}
        />
      </Svg>
    </View>
  );
}

function WelcomeWordmark({ width }: { width: number }) {
  const palette = usePalette();
  const height = width * (632 / 1897);
  const columnWidth = (width - 8) / 2;

  return (
    <View
      accessibilityLabel="TRACEPAY"
      className="relative mt-3"
      style={{ width, height }}
    >
      <View className="absolute left-0 top-0" style={{ width: columnWidth, height }}>
        <TraceWordmark
          width={columnWidth}
          height={height}
          color={palette.foreground}
          preserveAspectRatio="xMidYMid meet"
        />
      </View>
      <View
        className="absolute top-0"
        style={{ left: columnWidth - 12, width: columnWidth, height }}
      >
        <PayWordmark
          width={columnWidth}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
      </View>
    </View>
  );
}

function WelcomeLogo({ size, wordmarkWidth }: { size: number; wordmarkWidth: number }) {
  const palette = usePalette();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const height =
    size * (TRACEPAY_ICON_COMPOSITION.height / TRACEPAY_ICON_COMPOSITION.width);

  return (
    <View className="items-center">
      <View
        accessibilityLabel="TracePay"
        className="items-center justify-center shadow-lg shadow-accent"
        style={{
          width: size,
          height,
          shadowColor: palette.accent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isDark ? 0.55 : 0.28,
          shadowRadius: 28,
          elevation: isDark ? 18 : 10,
        }}
      >
        <AssembledTracePayIcon
          width={size}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
      </View>
      <WelcomeWordmark width={wordmarkWidth} />
    </View>
  );
}

function Pagination() {
  return (
    <View className="mt-7 flex-row items-center justify-center gap-[7px]">
      <View className="h-[6px] w-[22px] rounded-full bg-primary" />
      <View className="h-[6px] w-[6px] rounded-full bg-primary/30" />
      <View className="h-[6px] w-[6px] rounded-full bg-primary/30" />
    </View>
  );
}

export function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const palette = usePalette();
  const logoSize = Math.min(width * 0.52, 210);
  const wordmarkWidth = Math.min(width * 0.78, 300);
  const sheetHeight = Math.min(height * 0.72, 640);

  const { error, requestReset, setError, signIn, signUp, submitting } = useAuth();
  const { hasPin, lockApp, unlockApp } = useAppLock();
  const [panel, setPanel] = useState<Panel>("welcome");
  const [formMode, setFormMode] = useState<WelcomeAuthMode>("create");
  const lockingRef = useRef(false);
  const progress = useSharedValue(0);
  const isWelcome = panel === "welcome";

  const continueAfterLogin = () => {
    continueAfterAuth({ hasPin, lockApp, router, unlockApp });
  };

  const resetPanel = () => {
    lockingRef.current = false;
    setError(null);
    setPanel("welcome");
  };

  const openPanel = (next: WelcomeAuthMode) => {
    if (panel !== "welcome" || lockingRef.current) {
      return;
    }

    lockingRef.current = true;
    setFormMode(next);
    setPanel(next);
    progress.value = withTiming(1, SHEET, (finished) => {
      if (finished) {
        lockingRef.current = false;
      }
    });
  };

  const switchMode = (next: WelcomeAuthMode) => {
    if (panel === "welcome" || submitting) {
      return;
    }

    setError(null);
    setFormMode(next);
    setPanel(next);
  };

  const handleBack = () => {
    if (formMode === "forgot") {
      switchMode("login");
      return;
    }
    closePanel();
  };

  const closePanel = () => {
    if (panel === "welcome" || submitting) {
      return;
    }

    lockingRef.current = true;
    progress.value = withTiming(0, SHEET_CLOSE, (finished) => {
      if (finished) {
        runOnJS(resetPanel)();
        return;
      }
      lockingRef.current = false;
    });
  };

  const submitForm = async (payload: WelcomeAuthPayload) => {
    if (submitting || panel === "welcome") {
      return;
    }

    try {
      if (panel === "forgot") {
        await requestReset(payload.phone);
        router.push({
          pathname: "/(auth)/otp",
          params: {
            phone: getPendingPhone() ?? payload.phone,
            flow: "reset",
          },
        });
        return;
      }

      if (panel === "create") {
        await signUp({
          fullName: payload.name ?? "",
          phone: payload.phone,
          password: payload.password ?? "",
        });
        router.push({
          pathname: "/(auth)/otp",
          params: {
            phone: getPendingPhone() ?? payload.phone,
            flow: "signup",
          },
        });
        return;
      }

      const result = await signIn({
        phone: payload.phone,
        password: payload.password ?? "",
      });

      if (result.requiresOtp) {
        router.push({
          pathname: "/(auth)/otp",
          params: {
            phone: getPendingPhone() ?? payload.phone,
            flow: "login",
          },
        });
        return;
      }

      continueAfterLogin();
    } catch {
      return;
    }
  };

  const welcomeCopyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [0, -18], Extrapolation.CLAMP),
      },
    ],
  }));

  const welcomeActionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.28], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [0, 24], Extrapolation.CLAMP),
      },
    ],
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.15, 0.45], [0, 1], Extrapolation.CLAMP),
  }));

  const brandStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(progress.value, [0, 1], [1, 0.72], Extrapolation.CLAMP),
      },
      {
        translateY: interpolate(progress.value, [0, 1], [0, -12], Extrapolation.CLAMP),
      },
    ],
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [sheetHeight + 40, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View
      className="flex-1 bg-background"
      style={{ backgroundColor: palette.background }}
    >
      <WelcomeBackdrop width={width} height={height} />
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="flex-1">
          <Animated.View
            pointerEvents="none"
            className="items-center pt-10"
            style={brandStyle}
          >
            <WelcomeLogo size={logoSize} wordmarkWidth={wordmarkWidth} />
          </Animated.View>

          <Animated.View
            pointerEvents={isWelcome ? "auto" : "none"}
            className="mt-10 items-center px-7"
            style={welcomeCopyStyle}
          >
            <Text className="text-center text-[32px] font-medium tracking-[-0.3px] text-foreground">
              Welcome
            </Text>
            <Text className="mt-3 text-center text-[16px] leading-[24px] text-muted-foreground">
              {SUBTITLE}
            </Text>
            <Pagination />
          </Animated.View>

          <View className="flex-1" />

          <Animated.View
            pointerEvents={isWelcome ? "auto" : "none"}
            className="gap-3.5 px-7 pb-10"
            style={welcomeActionsStyle}
          >
            <Button arrow onPress={() => openPanel("create")}>
              Create Account
            </Button>
            <Button
              arrow
              variant="outline"
              onPress={() => openPanel("login")}
            >
              Log In
            </Button>
          </Animated.View>

          <Animated.View
            pointerEvents={isWelcome ? "none" : "auto"}
            className="absolute bottom-0 left-0 right-0 z-10 overflow-hidden bg-card px-7 pt-8 shadow-2xl shadow-black/20"
            style={[
              sheetStyle,
              {
                height: sheetHeight,
                borderTopLeftRadius: 36,
                borderTopRightRadius: 36,
              },
            ]}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              className="flex-1"
            >
              <ScrollView
                className="flex-1"
                contentContainerClassName="pb-10"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <WelcomeAuthForm
                  error={error}
                  mode={formMode}
                  reveal={progress}
                  submitting={submitting}
                  onSubmit={submitForm}
                  onSwitchMode={switchMode}
                />
              </ScrollView>
            </KeyboardAvoidingView>
          </Animated.View>

          <Animated.View
            pointerEvents={isWelcome ? "none" : "auto"}
            className="absolute left-2 top-1 z-50"
            style={[backStyle, { elevation: 24 }]}
          >
            <IconButton
              accessibilityLabel={formMode === "forgot" ? "Back to log in" : "Back to welcome"}
              hitSlop={12}
              variant="ghost"
              onPress={handleBack}
            >
              <Ionicons
                color={palette.foreground}
                name="chevron-back"
                size={22}
              />
            </IconButton>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
