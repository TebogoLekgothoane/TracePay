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
  hasAuthSession,
  subscribeSessionPresence,
} from "../src/features/auth/auth.service";
import {
  getSupabase,
  isSupabaseConfigured,
} from "../src/lib/supabase";
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
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const { hasPin, isHydrated, isLocked, lockApp } = useAppLock();
  const router = useRouter();
  const segments = useSegments();
  const palette = COLORS[colorScheme];
  const isDark = colorScheme === "dark";

  const routeState = useMemo(() => {
    const group = segments[0];
    const screen = segments[1];
    const isAuthRoute = group === "(auth)";
    const isWelcomeRoute = isAuthRoute && screen === "welcome";
    const isUnlockRoute = isAuthRoute && screen === "unlock";
    const isPinSetupRoute =
      isAuthRoute &&
      ["device-security", "confirm-pin", "biometric-setup"].includes(
        screen ?? "",
      );
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
    const isPostPinSetupRoute =
      isAuthRoute && screen === "biometric-setup";
    const isProtectedRoute =
      group === "(tabs)" ||
      (group !== undefined &&
        group !== "(auth)" &&
        group !== "(onboarding)");

    return {
      isProtectedRoute,
      isRecoveryRoute,
      isPostPinSetupRoute,
      isPinSetupRoute,
      isUnlockRoute,
      isWelcomeRoute,
    };
  }, [segments]);

  useEffect(() => {
    return subscribeSessionPresence((present) => {
      setHasSession(present);
    });
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void hasAuthSession()
      .then((present) => {
        if (!active) {
          return;
        }
        setHasSession(present);
        if (present && hasPin) {
          lockApp();
        }
      })
      .catch(() => {
        if (active) {
          setHasSession(false);
        }
      });

    if (isSupabaseConfigured()) {
      const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
        if (!active) {
          return;
        }

        const present = Boolean(session?.access_token);
        setHasSession(present);

        // Cold start only — interactive login locks explicitly before unlock.
        if (present && hasPin && event === "INITIAL_SESSION") {
          lockApp();
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [hasPin, isHydrated, lockApp]);

  const handleAnimatedSplashLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const handleAnimationComplete = useCallback(() => {
    setShowAnimatedSplash(false);
  }, []);

  useEffect(() => {
    if (showAnimatedSplash || !isHydrated || hasSession === null) {
      return;
    }

    if (hasSession && hasPin && isLocked) {
      if (
        !routeState.isUnlockRoute &&
        !routeState.isRecoveryRoute &&
        !routeState.isPostPinSetupRoute &&
        !routeState.isPinSetupRoute
      ) {
        router.replace("/(auth)/unlock");
      }
      return;
    }

    if (!hasSession) {
      if (
        routeState.isProtectedRoute ||
        routeState.isUnlockRoute ||
        routeState.isPinSetupRoute
      ) {
        router.replace("/(auth)/welcome");
      }
      return;
    }

    if (routeState.isWelcomeRoute || routeState.isUnlockRoute) {
      router.replace("/(tabs)");
    }
  }, [
    hasPin,
    hasSession,
    isHydrated,
    isLocked,
    routeState,
    router,
    showAnimatedSplash,
  ]);

  const shouldCoverProtectedContent =
    !showAnimatedSplash &&
    (!isHydrated ||
      hasSession === null ||
      (routeState.isProtectedRoute && isLocked));

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
          pointerEvents="none"
          onLayout={handleAnimatedSplashLayout}
          className="absolute inset-0 overflow-hidden"
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
