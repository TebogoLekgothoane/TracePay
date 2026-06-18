import "@/theme/global.css";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Appearance, View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useProfileStore } from "@/stores/profileStore";
import { SMSIngestionProvider } from "@/context/SMSIngestionContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useInitialAndroidBarSync } from "@/hooks/useInitialAndroidBarSync";
import { NAV_THEME } from "@/theme/colors";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const { onboardingComplete, isAuthenticated, isLoaded, loadFromStorage } = useProfileStore();
  const { colors } = useColorScheme();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isLoaded) return;

    const root = segments[0] as string | undefined;
    const inOnboarding = root === "(onboarding)";
    const onBoot = !root || root === "index";
    const onSmsFlow = root === "sms-scanning" || root === "sms-results";

    if (onBoot) {
      if (!isAuthenticated) router.replace("/(onboarding)/language");
      else if (!onboardingComplete) router.replace("/sms-scanning");
      else router.replace("/(tabs)");
      return;
    }

    if (!isAuthenticated) {
      if (!inOnboarding) router.replace("/(onboarding)/language");
      return;
    }

    if (!onboardingComplete) {
      if (!onSmsFlow) router.replace("/sms-scanning");
      return;
    }

    if (inOnboarding || onBoot) {
      router.replace("/(tabs)");
    }
  }, [isLoaded, isAuthenticated, onboardingComplete, segments]);

  if (!isLoaded) {
    return (
      <View className="screen items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="index" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="history" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="sms-scanning" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="sms-results" options={{ headerShown: false, presentation: "card" }} />
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
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={NAV_THEME[colorScheme]}>
            <SMSIngestionProvider>
              <GestureHandlerRootView className="flex-1 bg-background">
                <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
                <KeyboardProvider>
                  <NavigationGuard>
                    <RootLayoutNav />
                  </NavigationGuard>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </SMSIngestionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
