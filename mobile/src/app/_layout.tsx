import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useProfileStore } from "@/stores/profileStore";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const { onboardingComplete, isAuthenticated, isLoaded, loadFromStorage } = useProfileStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isLoaded) return;

    const root = segments[0] as string | undefined;
    const inOnboarding = root === "(onboarding)";
    const onWelcome = root === "welcome";
    const onBoot = !root || root === "index";
    const onSmsFlow = root === "sms-scanning" || root === "sms-results";

    if (!isAuthenticated) {
      if (!onWelcome) router.replace("/welcome");
      return;
    }

    if (!onboardingComplete) {
      if (!inOnboarding && !onSmsFlow) router.replace("/(onboarding)/language");
      return;
    }

    if (inOnboarding || onWelcome || onBoot) {
      router.replace("/(tabs)");
    }
  }, [isLoaded, isAuthenticated, onboardingComplete, segments]);

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }
  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="welcome" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="history" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="sms-scanning" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="sms-results" options={{ headerShown: false, presentation: "card" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <NavigationGuard>
                <RootLayoutNav />
              </NavigationGuard>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F6FB" },
});
