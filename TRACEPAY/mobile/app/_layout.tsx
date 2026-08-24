import "../src/theme/global.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import {
  TracePayAnimatedSplash,
  TRACEPAY_SPLASH_BACKGROUNDS,
} from "../src/components/TracePayAnimatedSplash";
import {
  AppLockProvider,
  useAppLock,
} from "../src/features/security/AppLockProvider";
import { COLORS } from "../src/theme/colors";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const splashBackground = TRACEPAY_SPLASH_BACKGROUNDS[scheme];

  useEffect(() => {
    setColorScheme("system");
  }, [setColorScheme]);

  return (
    <GestureHandlerRootView
      className={`flex-1 bg-background ${scheme === "dark" ? "dark" : ""}`}
      style={{ flex: 1, backgroundColor: splashBackground }}
    >
      <BottomSheetModalProvider>
        <AppLockProvider>
          <RootNavigator colorScheme={scheme} />
        </AppLockProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator({
  colorScheme,
}: {
  colorScheme: "light" | "dark";
}) {
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const { hasPin, isHydrated, isLocked } = useAppLock();
  const router = useRouter();
  const segments = useSegments();
  const palette = COLORS[colorScheme];
  const isDark = colorScheme === "dark";

  const routeState = useMemo(() => {
    const group = segments[0];
    const screen = segments[1];
    const isAuthRoute = group === "(auth)";
    const isUnlockRoute = isAuthRoute && screen === "unlock";
    const isRecoveryRoute =
      isAuthRoute &&
      [
        "password",
        "otp",
        "reset-pin",
        "reset-pin-create",
        "reset-pin-confirm",
        "reset-pin-success",
        "restore-account",
        "new-password",
        "password-updated",
      ].includes(screen ?? "");
    const isProtectedRoute =
      group === "(tabs)" ||
      (group !== undefined &&
        group !== "(auth)" &&
        group !== "(onboarding)");

    return {
      isProtectedRoute,
      isRecoveryRoute,
      isUnlockRoute,
    };
  }, [segments]);

  const handleAnimatedSplashLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const handleAnimationComplete = useCallback(() => {
    router.replace("/");
    setShowAnimatedSplash(false);
  }, [router]);

  useEffect(() => {
    if (showAnimatedSplash || !isHydrated) {
      return;
    }

    if (hasPin && isLocked) {
      if (!routeState.isUnlockRoute && !routeState.isRecoveryRoute) {
        router.replace("/(auth)/unlock");
      }
      return;
    }

    if (!isLocked && routeState.isUnlockRoute) {
      router.replace("/(tabs)");
      return;
    }

    if (!hasPin && isLocked && routeState.isProtectedRoute) {
      router.replace("/");
    }
  }, [
    hasPin,
    isHydrated,
    isLocked,
    routeState,
    router,
    showAnimatedSplash,
  ]);

  const shouldCoverProtectedContent =
    !showAnimatedSplash &&
    (!isHydrated || (routeState.isProtectedRoute && isLocked));

  return (
    <View
      className={`flex-1 bg-background ${isDark ? "dark" : ""}`}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          contentStyle: {
            backgroundColor: palette.background,
          },
        }}
      >
        <Stack.Screen
          name="(onboarding)"
          options={{
            headerShown: false,
            animation: "fade",
            gestureEnabled: false,
          }}
        />

        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
      </Stack>

      {showAnimatedSplash ? (
        <View
          onLayout={handleAnimatedSplashLayout}
          className="absolute inset-0"
        >
          <TracePayAnimatedSplash
            onAnimationComplete={handleAnimationComplete}
          />
        </View>
      ) : null}

      {shouldCoverProtectedContent ? (
        <View
          pointerEvents="auto"
          className="absolute inset-0 bg-background"
          style={{ backgroundColor: palette.background }}
        />
      ) : null}
    </View>
  );
}
