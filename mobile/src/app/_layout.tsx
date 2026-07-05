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
import { SMSIngestionProvider } from "@/context/SMSIngestionContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useInitialAndroidBarSync } from "@/hooks/useInitialAndroidBarSync";
import { NAV_THEME } from "@/theme/colors";

SplashScreen.preventAutoHideAsync();

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const { onboardingComplete, isAuthenticated, isLoaded, initializeAuth } = useProfileStore();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    void initializeAuth().then((cleanup) => {
      unsubscribe = cleanup;
    });

    return () => unsubscribe?.();
  }, [initializeAuth]);

  useEffect(() => {
    if (!isLoaded) return;

    const root = segments[0] as string | undefined;
    const onboardingRoute = segments[1] as string | undefined;
    const tabRoute = segments[1] as string | undefined;
    const inOnboarding = root === "(onboarding)";
    const inTabs = root === "(tabs)";
    const onBoot = !root || root === "index";
    const onAuthScreen = inOnboarding && !onboardingRoute;
    const onRecoveryScreen = inOnboarding && onboardingRoute === "forgot-password";
    const inPostAuthOnboarding = inOnboarding && Boolean(onboardingRoute) && onboardingRoute !== "forgot-password";
    const onSmsFlow =
      inTabs && (tabRoute === "sms-scanning" || tabRoute === "sms-results");

    if (onBoot) {
      if (!isAuthenticated) router.replace("/(onboarding)");
      else if (!onboardingComplete) router.replace("/(onboarding)/language");
      else router.replace("/(tabs)");
      return;
    }

    if (!isAuthenticated) {
      if (!onAuthScreen && !onRecoveryScreen) router.replace("/(onboarding)");
      return;
    }

    if (!onboardingComplete) {
      if (!inPostAuthOnboarding && !onSmsFlow) router.replace("/(onboarding)/language");
      return;
    }

    if (inOnboarding || onBoot) {
      router.replace("/(tabs)");
    }
  }, [isLoaded, isAuthenticated, onboardingComplete, segments]);

  return (
    <SkeletonReveal loading={!isLoaded} skeleton={<SkeletonBoot />} className="flex-1">
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
