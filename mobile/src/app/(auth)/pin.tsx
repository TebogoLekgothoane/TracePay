import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { AppText } from "@/components/Typography";
import { AuthErrorBanner } from "@/components/AuthErrorBanner";
import { useDeviceAuthStore } from "@/stores/deviceAuthStore";

export default function PinScreen() {
  const verifyPin = useDeviceAuthStore((s) => s.verifyPin);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setError("");
    const ok = await verifyPin(pin);
    setLoading(false);
    if (ok) {
      router.replace("/(tabs)");
      return;
    }
    setError("Incorrect PIN. Try again.");
    setPin("");
  };

  return (
    <SafeAreaView className="flex-1 bg-background px-6 dark:bg-transparent">
      <View className="flex-1 justify-center">
        <AppText variant="display" className="text-center">Enter PIN</AppText>
        <AppText variant="lead" className="mt-2 text-center">
          Enter your 4-digit PIN to unlock TracePay
        </AppText>

        <View className="mt-8 flex-row justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              className={`h-3 w-3 rounded-full ${pin.length > i ? "bg-primary" : "bg-muted dark:bg-white/20"}`}
            />
          ))}
        </View>

        <TextInput
          className="absolute h-0 w-0 opacity-0"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          maxLength={4}
          autoFocus
          onSubmitEditing={handleSubmit}
        />

        <View className="mt-10 gap-3">
          {error ? <AuthErrorBanner message={error} /> : null}
          <Button size="lg" fullWidth className="h-14 rounded-[24px]" onPress={handleSubmit} loading={loading} disabled={pin.length < 4}>
            Unlock
          </Button>
          <Pressable onPress={() => router.push("/(auth)/sign-in")} className="py-2">
            <AppText variant="bodySm" className="text-center font-semibold text-brand-purple dark:text-primary">
              Forgot PIN? Sign in with password
            </AppText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
