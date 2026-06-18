import { View } from "react-native";
import { Stack, useSegments } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getOnboardingStepFromRoute,
  OnboardingHeader,
} from "@/components/OnboardingHeader";

export default function OnboardingLayout() {
  const segments = useSegments();
  const routeName = segments[segments.length - 1] ?? "";
  const currentStep = getOnboardingStepFromRoute(routeName);

  return (
    <View className="flex-1 bg-background">
      {currentStep !== null && (
        <SafeAreaView edges={["top"]} className="bg-background">
          <OnboardingHeader currentStep={currentStep} />
        </SafeAreaView>
      )}

      <View className="flex-1">
        <Stack
          screenOptions={{ headerShown: false, animation: "slide_from_right" }}
          initialRouteName="language"
        >
          <Stack.Screen name="language" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="features" />
          <Stack.Screen name="consent" />
          <Stack.Screen name="index" />
        </Stack>
      </View>
    </View>
  );
}
