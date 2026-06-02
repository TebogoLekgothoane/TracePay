import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="language" />
      <Stack.Screen name="features" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="connect-accounts" />
    </Stack>
  );
}
