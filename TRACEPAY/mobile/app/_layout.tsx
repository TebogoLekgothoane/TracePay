import "../src/theme/global.css";

import { BottomSheetModalProvider } from "@expo/ui/community/bottom-sheet";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { AppState, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import {
  TracePayAnimatedSplash,
  TRACEPAY_SPLASH_BACKGROUNDS,
} from "../src/components/TracePayAnimatedSplash";
import { resolveAuthenticatedHomeHref } from "../src/features/auth/auth.navigation";
import {
  getAuthUserId,
  hasAuthSession,
  resetLocalClientForFreshSignup,
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
import {
  classifyRoute,
  decideRoute,
} from "../src/features/security/app-lock.policy";
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
      style={[styles.root, { backgroundColor: splashBackground }]}
    >
      <View
        className={scheme === "dark" ? "dark" : undefined}
        style={[styles.root, { backgroundColor: splashBackground }]}
      >
        <BottomSheetModalProvider>
          <AppLockProvider>
            <RootNavigator colorScheme={scheme} />
          </AppLockProvider>
        </BottomSheetModalProvider>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

function RootNavigator({
  colorScheme,
}: {
  colorScheme: "light" | "dark";
}) {
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const [clientResetDone, setClientResetDone] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const {
    clearDeviceLock,
    hasPin,
    isHydrated,
    isLocked,
    reconcilePinOwner,
  } = useAppLock();
  const navigationState = useRootNavigationState();
  const navigationReady = Boolean(navigationState?.key);
  const router = useRouter();
  const segments = useSegments();
  const palette = COLORS[colorScheme];
  const isDark = colorScheme === "dark";

  const route = useMemo(() => classifyRoute(segments), [segments]);

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
    void resetLocalClientForFreshSignup({ clearDeviceLock })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setClientResetDone(true);
        }
      });

    return () => {
      active = false;
    };
  }, [clearDeviceLock, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !clientResetDone) {
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    const syncSession = () => {
      // Supabase is the source of truth: getSession refreshes an expired
      // access token and returns null when the refresh token is revoked or
      // the session can no longer be refreshed.
      void hasAuthSession()
        .then((present) => {
          if (active) {
            setHasSession(present);
          }
        })
        .catch(() => {
          if (active) {
            setHasSession(false);
          }
        });
    };

    syncSession();

    if (isSupabaseConfigured()) {
      const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
        if (active) {
          setHasSession(Boolean(session?.access_token));
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncSession();
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
      appStateSubscription.remove();
    };
  }, [clientResetDone, isHydrated]);

  // A PIN belongs to one Supabase user. Another account signing in on this
  // device never inherits it.
  useEffect(() => {
    if (!hasSession || !hasPin) {
      return;
    }
    let active = true;
    void getAuthUserId()
      .then((userId) => {
        if (active && userId) {
          return reconcilePinOwner(userId);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [hasPin, hasSession, reconcilePinOwner]);

  const handleAnimatedSplashLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const handleAnimationComplete = useCallback(() => {
    setShowAnimatedSplash(false);
  }, []);

  const guardReady =
    navigationReady && isHydrated && clientResetDone && hasSession !== null;

  const decision = useMemo(
    () =>
      guardReady
        ? decideRoute({
            route,
            hasSession: hasSession === true,
            hasPin,
            isLocked,
          })
        : null,
    [guardReady, hasPin, hasSession, isLocked, route],
  );

  useEffect(() => {
    if (showAnimatedSplash || !decision) {
      return;
    }

    if (decision.action === "redirect") {
      router.replace(decision.to);
      return;
    }

    if (decision.action === "home") {
      let active = true;
      void resolveAuthenticatedHomeHref().then((href) => {
        if (active) {
          router.replace(href);
        }
      });
      return () => {
        active = false;
      };
    }

    // Statement upload is required — keep users out of the app until they have an account.
    if (route === "protected") {
      let active = true;
      void resolveAuthenticatedHomeHref().then((href) => {
        if (active && href !== "/(tabs)") {
          router.replace(href);
        }
      });
      return () => {
        active = false;
      };
    }
  }, [decision, route, router, showAnimatedSplash]);

  // Hide whatever is mounted until the guard has decided, and whenever the
  // current route is about to be replaced (e.g. app content while locked).
  const shouldCoverProtectedContent =
    !showAnimatedSplash &&
    (!guardReady ||
      decision?.action === "redirect" ||
      (route === "protected" && (isLocked || !hasSession) && hasPin));

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.background,
      }}
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
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background }]}
        />
      ) : null}
    </View>
  );
}
