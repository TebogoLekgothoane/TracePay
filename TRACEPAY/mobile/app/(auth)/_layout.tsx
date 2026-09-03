import { Stack } from "expo-router";
import { useColorScheme } from "nativewind";

import { COLORS } from "../../src/theme/colors";

export default function AuthLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const background = COLORS[isDark ? "dark" : "light"].background;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        animationDuration: 250,
        gestureEnabled: true,
        contentStyle: {
          backgroundColor: background,
        },
      }}
    >
      <Stack.Screen
        name="welcome"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="otp"
        options={{
          headerShown: false,
          gestureEnabled: true,
        }}
      />

      <Stack.Screen
        name="create-account"
        options={{
          headerShown: false,
          gestureEnabled: true,
        }}
      />

      <Stack.Screen
        name="device-security"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="confirm-pin"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="biometric-setup"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="unlock"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="reset-pin"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="reset-pin-create"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="reset-pin-confirm"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="reset-pin-success"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="password"
        options={{
          headerShown: false,
          gestureEnabled: true,
        }}
      />

      <Stack.Screen
        name="restore-account"
        options={{
          headerShown: false,
          gestureEnabled: true,
        }}
      />

      <Stack.Screen
        name="new-password"
        options={{
          headerShown: false,
          gestureEnabled: true,
        }}
      />

      <Stack.Screen
        name="password-updated"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}