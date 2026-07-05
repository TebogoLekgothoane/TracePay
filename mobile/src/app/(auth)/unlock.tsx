import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { AppText } from "@/components/Typography";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useDeviceAuthStore } from "@/stores/deviceAuthStore";

export default function UnlockScreen() {
  const { isReady, isAvailable, biometricType, authenticate } = useBiometricAuth();
  const biometricEnabled = useDeviceAuthStore((s) => s.biometricEnabled);
  const pinEnabled = useDeviceAuthStore((s) => s.pinEnabled);
  const unlock = useDeviceAuthStore((s) => s.unlock);
  const { colors } = useColorScheme();
  const [error, setError] = useState("");
  const promptedRef = useRef(false);

  useEffect(() => {
    if (!isReady) return;
    if (biometricEnabled && isAvailable) return;
    if (!biometricEnabled && pinEnabled) {
      router.replace("/(auth)/pin");
    }
  }, [isReady, biometricEnabled, isAvailable, pinEnabled]);

  useEffect(() => {
    if (!isReady || !biometricEnabled || !isAvailable || promptedRef.current) return;

    promptedRef.current = true;
    void (async () => {
      const ok = await authenticate(`Unlock with ${biometricType}`);
      if (ok) {
        unlock();
        router.replace("/(tabs)");
      }
    })();
  }, [isReady, authenticate, biometricEnabled, biometricType, isAvailable, unlock]);

  const handleBiometric = async () => {
    setError("");
    const ok = await authenticate(`Unlock with ${biometricType}`);
    if (ok) {
      unlock();
      router.replace("/(tabs)");
      return;
    }
    setError("Authentication failed. Try again or use your PIN.");
  };

  if (!isReady) {
    return (
      <SafeAreaView className="flex-1 bg-background px-6 dark:bg-transparent">
        <View className="flex-1 items-center justify-center">
          <AppText variant="lead">Checking biometrics…</AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!biometricEnabled && pinEnabled) {
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-background px-6 dark:bg-transparent">
      <View className="flex-1 justify-center">
        <View className="mb-8 items-center">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-brand-purple-light dark:bg-primary/20">
            <MaterialCommunityIcons
              name={biometricType === "Face ID" ? "face-recognition" : "fingerprint"}
              size={40}
              color={colors.primary}
            />
          </View>
          <AppText variant="display" className="text-center">Welcome back</AppText>
          <AppText variant="lead" className="mt-2 text-center">
            {isAvailable && biometricEnabled
              ? `Use ${biometricType} to unlock TracePay`
              : biometricEnabled
                ? `${biometricType} is not set up on this device. Use your PIN instead.`
                : "Unlock TracePay to continue"}
          </AppText>
        </View>

        {error ? (
          <AppText variant="bodySm" className="mb-4 text-center text-destructive">{error}</AppText>
        ) : null}

        {isAvailable && biometricEnabled ? (
          <Button size="lg" fullWidth className="mb-3 h-14 rounded-[24px]" onPress={handleBiometric}>
            Unlock with {biometricType}
          </Button>
        ) : null}

        {pinEnabled ? (
          <Button variant="outline" size="lg" fullWidth className="mb-3 h-14 rounded-[24px]" onPress={() => router.push("/(auth)/pin")}>
            Use PIN
          </Button>
        ) : null}

        <Button variant="ghost" fullWidth onPress={() => router.push("/(auth)/sign-in")}>
          Forgot PIN? Sign in with password
        </Button>
      </View>
    </SafeAreaView>
  );
}
