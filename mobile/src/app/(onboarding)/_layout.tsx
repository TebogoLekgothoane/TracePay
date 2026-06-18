import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} initialRouteName="language">
      <Stack.Screen name="language" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="features" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="index" />
    </Stack>
  );
}
