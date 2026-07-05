import { View } from "react-native";
import { Stack, useSegments } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getOnboardingStepFromRoute,
  OnboardingHeader,
} from "@/components/OnboardingHeader";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function OnboardingLayout() {
  const segments = useSegments();
  const routeName = segments[segments.length - 1] ?? "";
  const currentStep = getOnboardingStepFromRoute(routeName);
  const { isDarkColorScheme } = useColorScheme();

  return (
    <View className={isDarkColorScheme ? "flex-1 bg-transparent" : "flex-1 bg-background"}>
      {currentStep !== null && (
        <SafeAreaView
          edges={["top"]}
          className={isDarkColorScheme ? "bg-transparent" : "bg-background"}
        >
          <OnboardingHeader
            currentStep={currentStep}
            showBack={currentStep > 0}
          />
        </SafeAreaView>
      )}

      <View className="flex-1">
        <Stack
          screenOptions={{ headerShown: false, animation: "slide_from_right" }}
          initialRouteName="index"
        >
          <Stack.Screen name="language" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="features" />
          <Stack.Screen name="consent" />
          <Stack.Screen name="index" />
          <Stack.Screen name="forgot-password" />
        </Stack>
      </View>
    </View>
  );
}
