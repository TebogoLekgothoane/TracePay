import "@/theme/global.css";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ThemeProvider } from "@react-navigation/native";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Appearance } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlassBackground } from "@/components/GlassBackground";
import { SkeletonBoot } from "@/components/ScreenSkeletons";
import { SkeletonReveal } from "@/components/ContentTransition";
import { useProfileStore } from "@/stores/profileStore";
import { useDeviceAuthStore } from "@/stores/deviceAuthStore";
import { SMSIngestionProvider } from "@/context/SMSIngestionContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useInitialAndroidBarSync } from "@/hooks/useInitialAndroidBarSync";
import { NAV_THEME } from "@/theme/colors";

SplashScreen.preventAutoHideAsync();

const PRE_AUTH_ROUTES = new Set([
  "language",
  "welcome",
  "features",
  "create-account",
  "otp",
  "index",
  "forgot-password",
]);

const POST_AUTH_ONBOARDING_ROUTES = new Set([
  "biometrics",
  "consent",
  "sms-permission",
]);

const AUTH_UNLOCK_ROUTES = new Set(["unlock", "pin", "sign-in"]);

function getResumeOnboardingRoute(
  pinEnabled: boolean,
  consentGiven: boolean,
): "/(onboarding)/biometrics" | "/(onboarding)/consent" | "/(onboarding)/sms-permission" {
  if (!pinEnabled) return "/(onboarding)/biometrics";
  if (!consentGiven) return "/(onboarding)/consent";
  return "/(onboarding)/sms-permission";
}

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const {
    onboardingComplete,
    isAuthenticated,
    isLoaded,
    consentGiven,
    initializeAuth,
  } = useProfileStore();
  const {
    isUnlocked,
    pinEnabled,
    isLoaded: deviceAuthLoaded,
    loadFromStorage: loadDeviceAuth,
    initializeAppLock,
  } = useDeviceAuthStore();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let removeAppLock: (() => void) | undefined;

    void loadDeviceAuth();
    void initializeAuth().then((cleanup) => {
      unsubscribe = cleanup;
    });
    removeAppLock = initializeAppLock();

    return () => {
      unsubscribe?.();
      removeAppLock?.();
    };
  }, [initializeAuth, loadDeviceAuth, initializeAppLock]);

  useEffect(() => {
    if (!isLoaded || !deviceAuthLoaded) return;

    const root = segments[0] as string | undefined;
    const childRoute = segments[1] as string | undefined;
    const onBoot = !root || root === "index";
    const inOnboarding = root === "(onboarding)";
    const inAuth = root === "(auth)";
    const inTabs = root === "(tabs)";
    const onSmsFlow =
      inTabs && (childRoute === "sms-scanning" || childRoute === "sms-results");

    if (onBoot) {
      if (!isAuthenticated) {
        router.replace("/(onboarding)/language");
        return;
      }
      if (onboardingComplete && !pinEnabled) {
        router.replace("/(onboarding)/biometrics");
        return;
      }
      if (!onboardingComplete) {
        router.replace(getResumeOnboardingRoute(pinEnabled, consentGiven));
        return;
      }
      if (!isUnlocked) {
        router.replace("/(auth)/unlock");
        return;
      }
      router.replace("/(tabs)");
      return;
    }

    if (!isAuthenticated) {
      const allowedPreAuth =
        inOnboarding && childRoute && PRE_AUTH_ROUTES.has(childRoute);
      const allowedSignIn = inAuth && childRoute === "sign-in";
      if (!allowedPreAuth && !allowedSignIn) {
        router.replace("/(onboarding)/language");
      }
      return;
    }

    if (!onboardingComplete) {
      const allowedPostAuth =
        (inOnboarding && childRoute && POST_AUTH_ONBOARDING_ROUTES.has(childRoute)) ||
        (inOnboarding && childRoute === "otp") ||
        onSmsFlow;
      if (!allowedPostAuth) {
        router.replace(getResumeOnboardingRoute(pinEnabled, consentGiven));
      }
      return;
    }

    if (onboardingComplete && !pinEnabled) {
      const onBiometrics = inOnboarding && childRoute === "biometrics";
      if (!onBiometrics) {
        router.replace("/(onboarding)/biometrics");
      }
      return;
    }

    if (!isUnlocked) {
      const allowedUnlock =
        inAuth && childRoute && AUTH_UNLOCK_ROUTES.has(childRoute);
      if (!allowedUnlock) {
        router.replace("/(auth)/unlock");
      }
      return;
    }

    if (inOnboarding || inAuth || onBoot) {
      router.replace("/(tabs)");
    }
  }, [
    isLoaded,
    deviceAuthLoaded,
    isAuthenticated,
    onboardingComplete,
    consentGiven,
    pinEnabled,
    isUnlocked,
    segments,
  ]);

  return (
    <SkeletonReveal loading={!isLoaded || !deviceAuthLoaded} skeleton={<SkeletonBoot />} className="flex-1">
      {children}
    </SkeletonReveal>
  );
}

function RootLayoutNav() {
  const { isDarkColorScheme, colors } = useColorScheme();

  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        contentStyle: {
          backgroundColor: isDarkColorScheme ? "transparent" : colors.background,
        },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="recovery-email" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  useInitialAndroidBarSync();
  const { colorScheme, isDarkColorScheme } = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    Appearance.setColorScheme(null);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider value={NAV_THEME[colorScheme]}>
          <SMSIngestionProvider>
            <GestureHandlerRootView className="flex-1 bg-background">
              <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
              <KeyboardProvider>
                <GlassBackground>
                  <NavigationGuard>
                    <RootLayoutNav />
                  </NavigationGuard>
                </GlassBackground>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </SMSIngestionProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
