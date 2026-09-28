import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import AssembledTracePayIcon from "../../../assets/icons/assembled TracePay icon.svg";
import PayWordmark from "../../../assets/wordmark/PAY.svg";
import TraceWordmark from "../../../assets/wordmark/trace white wordmark.svg";
import { continueAfterAuth } from "../../features/auth/auth.navigation";
import { getPendingPhone } from "../../features/auth/auth.service";
import { useAppLock } from "../../features/security/AppLockProvider";
import { useAuth } from "../../hooks/useAuth";
import { TRACEPAY } from "../../theme/colors";
import { Button } from "../ui/Button";
import { TRACEPAY_ICON_COMPOSITION } from "../tracePayIconComposition";
import {
  WelcomeAuthForm,
  type WelcomeAuthMode,
  type WelcomeAuthPayload,
} from "./WelcomeAuthForm";
import { WelcomeAuthSheet } from "./WelcomeAuthSheet";

const SUBTITLE = "Take control of your money.\nFind the leaks. Save your money.";
const AUTH_SHEET_HEIGHT_RATIO = 0.7;

function usePalette() {
  const { colorScheme } = useColorScheme();
  return TRACEPAY[colorScheme === "dark" ? "dark" : "light"];
}

function WelcomeWordmark({ width }: { width: number }) {
  const palette = usePalette();
  const height = width * (632 / 1897);
  const columnWidth = (width - 8) / 2;

  return (
    <View
      accessibilityLabel="TRACEPAY"
      className="relative mt-2"
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

function WelcomeLogo({
  size,
  wordmarkWidth,
}: {
  size: number;
  wordmarkWidth: number;
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const height =
    size * (TRACEPAY_ICON_COMPOSITION.height / TRACEPAY_ICON_COMPOSITION.width);
  const palette = usePalette();

  return (
    <View className="items-center">
      <View
        accessibilityLabel="TracePay"
        className="items-center justify-center"
        style={{
          width: size,
          height,
          ...(isDark
            ? {}
            : {
                shadowColor: palette.accent,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.28,
                shadowRadius: size > 100 ? 28 : 14,
                elevation: 10,
              }),
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

export function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const palette = usePalette();
  const heroLogoSize = Math.min(width * 0.52, 210);
  const heroWordmarkWidth = Math.min(width * 0.78, 300);
  const compactLogoSize = Math.min(width * 0.36, 132);
  const compactScale = compactLogoSize / heroLogoSize;

  const { error, requestReset, setError, signIn, signUp, submitting } = useAuth();
  const { hasPin, lockApp, unlockApp } = useAppLock();
  const [authMode, setAuthMode] = useState<WelcomeAuthMode | null>(null);
  const sheetOpen = authMode !== null;
  /** 0 = hero (sheet closed), 1 = compact (sheet open). Scrubs with sheet drag. */
  const sheetProgress = useSharedValue(0);

  const brandStyle = useAnimatedStyle(() => {
    const t = sheetProgress.value;
    return {
      paddingTop: interpolate(t, [0, 1], [40, 16], Extrapolation.CLAMP),
      transform: [
        {
          scale: interpolate(t, [0, 1], [1, compactScale], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      sheetProgress.value,
      [0, 0.55, 1],
      [1, 0.15, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const continueAfterLogin = () => {
    void continueAfterAuth({ hasPin, lockApp, router, unlockApp });
  };

  const openSheet = (mode: WelcomeAuthMode) => {
    if (submitting) {
      return;
    }
    setError(null);
    setAuthMode(mode);
  };

  const switchMode = (mode: WelcomeAuthMode) => {
    if (submitting) {
      return;
    }
    setError(null);
    setAuthMode(mode);
  };

  const closeSheet = () => {
    if (submitting) {
      return;
    }
    setError(null);
    setAuthMode(null);
  };

  const submitForm = async (payload: WelcomeAuthPayload) => {
    if (submitting || !authMode) {
      return;
    }

    try {
      if (authMode === "forgot") {
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

      if (authMode === "create") {
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

  return (
    <View style={[styles.flex, { backgroundColor: palette.background }]}>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <View style={styles.flex}>
          <Animated.View
            className="items-center"
            style={[{ transformOrigin: "top" }, brandStyle]}
          >
            <WelcomeLogo
              size={heroLogoSize}
              wordmarkWidth={heroWordmarkWidth}
            />
          </Animated.View>

          <Animated.View
            pointerEvents={sheetOpen ? "none" : "auto"}
            style={[styles.flex, heroContentStyle]}
          >
            <View className="mt-10 items-center px-7">
              <Text className="text-center text-[32px] font-medium text-foreground">
                Welcome
              </Text>
              <Text className="mt-3 text-center text-[16px] leading-[24px] text-muted-foreground">
                {SUBTITLE}
              </Text>
            </View>

            <View style={styles.flex} />

            <View className="gap-3.5 px-7 pb-10">
              <Button arrow onPress={() => openSheet("create")}>
                Create Account
              </Button>
              <Button arrow variant="outline" onPress={() => openSheet("login")}>
                Log In
              </Button>
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>

      <WelcomeAuthSheet
        dismissible={!submitting}
        heightRatio={AUTH_SHEET_HEIGHT_RATIO}
        progress={sheetProgress}
        visible={sheetOpen}
        onClose={closeSheet}
      >
        {authMode ? (
          <WelcomeAuthForm
            error={error}
            mode={authMode}
            submitting={submitting}
            onSubmit={submitForm}
            onSwitchMode={switchMode}
          />
        ) : null}
      </WelcomeAuthSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
