import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="unlock" />
      <Stack.Screen name="pin" />
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
