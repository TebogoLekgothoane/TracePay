import { Stack } from "expo-router";
import { useColorScheme } from "nativewind";

import { COLORS } from "../../src/theme/colors";

export default function OnboardingLayout() {
  const { colorScheme } = useColorScheme();
  const background =
    COLORS[colorScheme === "dark" ? "dark" : "light"].background;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: {
          backgroundColor: background,
        },
      }}
    >
      <Stack.Screen name="introduction" />
      <Stack.Screen name="language" />
      <Stack.Screen name="features" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
