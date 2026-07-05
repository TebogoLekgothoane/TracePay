import React, { useState } from "react";
import { View, TextInput, ScrollView, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { GlassInput } from "@/components/GlassInput";
import { AppText } from "@/components/Typography";
import { AuthErrorBanner } from "@/components/AuthErrorBanner";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useDeviceAuthStore } from "@/stores/deviceAuthStore";
import { useProfileStore } from "@/stores/profileStore";

const PURPLE = "#A855F7";

export default function BiometricsScreen() {
  const { isAvailable, biometricType } = useBiometricAuth();
  const { colors } = useColorScheme();
  const setBiometricEnabled = useDeviceAuthStore((s) => s.setBiometricEnabled);
  const setupPin = useDeviceAuthStore((s) => s.setupPin);
  const unlock = useDeviceAuthStore((s) => s.unlock);
  const onboardingComplete = useProfileStore((s) => s.onboardingComplete);
  const consentGiven = useProfileStore((s) => s.consentGiven);

  const [enableBio, setEnableBio] = useState(isAvailable);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const pinValid = pin.length >= 4 && pin === confirmPin;

  const handleContinue = async () => {
    if (!pinValid) {
      setError("Enter a 4-digit PIN and confirm it.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await setupPin(pin);
      await setBiometricEnabled(enableBio && isAvailable);
      unlock();
      if (onboardingComplete) {
        router.replace("/(tabs)");
      } else if (consentGiven) {
        router.push("/(onboarding)/sms-permission");
      } else {
        router.push("/(onboarding)/consent");
      }
    } catch {
      setError("Could not save your security settings. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-transparent" edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}>
        <AppText variant="display" className="mt-4">
          Secure your{"\n"}
          <AppText variant="displayAccent">account</AppText>
        </AppText>
        <AppText variant="lead" className="mt-3">
          Enable {biometricType} for quick unlock and set a PIN as backup.
        </AppText>

        <Card className="mt-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <AppText variant="title">Enable {biometricType}</AppText>
              <AppText variant="bodySm" className="mt-1">
                {isAvailable
                  ? "Unlock TracePay without entering your password each time."
                  : "Biometrics not available on this device. PIN will be used instead."}
              </AppText>
            </View>
            <Switch
              value={enableBio && isAvailable}
              onValueChange={setEnableBio}
              disabled={!isAvailable}
              trackColor={{ false: "#3F3F46", true: PURPLE }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        <View className="mt-6 gap-4">
          <View>
            <AppText variant="label" className="mb-2">Create PIN</AppText>
            <GlassInput>
              <MaterialCommunityIcons name="dialpad" size={18} color={colors.mutedForeground} />
              <TextInput
                className="flex-1 text-[15px] text-foreground"
                placeholder="4-digit PIN"
                placeholderTextColor={colors.mutedForeground}
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
              />
            </GlassInput>
          </View>

          <View>
            <AppText variant="label" className="mb-2">Confirm PIN</AppText>
            <GlassInput>
              <MaterialCommunityIcons name="dialpad" size={18} color={colors.mutedForeground} />
              <TextInput
                className="flex-1 text-[15px] text-foreground"
                placeholder="Re-enter PIN"
                placeholderTextColor={colors.mutedForeground}
                value={confirmPin}
                onChangeText={setConfirmPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
              />
            </GlassInput>
          </View>

          {error ? <AuthErrorBanner message={error} /> : null}
        </View>
      </ScrollView>

      <View className="border-t border-border px-6 pb-6 pt-4 dark:border-white/10">
        <Button size="lg" fullWidth className="h-14 rounded-[24px]" onPress={handleContinue} loading={loading} disabled={!pinValid}>
          Continue
        </Button>
      </View>
    </SafeAreaView>
  );
}
