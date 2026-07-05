import React, { useState } from "react";
import {
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { GlassInput } from "@/components/GlassInput";
import { AppText } from "@/components/Typography";
import { AuthErrorBanner } from "@/components/AuthErrorBanner";
import { AuthError } from "@/lib/auth-errors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";

export default function OtpScreen() {
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { phone, verifySignUpOtp, resendSignUpOtp, isAuthenticated } = useProfileStore();
  const { colors } = useColorScheme();

  const isValidOtp = otpCode.replace(/\s/g, "").length >= 6;

  const handleSubmit = async () => {
    if (!isValidOtp) return;
    setError("");
    setLoading(true);
    try {
      if (isAuthenticated) {
        router.replace("/(onboarding)/biometrics");
        return;
      }
      await verifySignUpOtp(otpCode);
      router.replace("/(onboarding)/biometrics");
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setLoading(true);
    try {
      await resendSignUpOtp();
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Could not resend code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-transparent" edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 }}
        >
          <AppText variant="display">
            Verify your{"\n"}
            <AppText variant="displayAccent">phone</AppText>
          </AppText>
          <AppText variant="lead" className="mt-3">
            Enter the 6-digit code we sent to {phone || "your phone"}.
          </AppText>

          <View className="mt-8 gap-5">
            <View>
              <AppText variant="label" className="mb-2">Verification code</AppText>
              <GlassInput>
                <MaterialCommunityIcons name="message-text-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  className="flex-1 text-[15px] text-foreground"
                  placeholder="6-digit code"
                  placeholderTextColor={colors.mutedForeground}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </GlassInput>
            </View>

            <Pressable onPress={handleResend} disabled={loading}>
              <AppText variant="bodySm" className="font-semibold text-brand-purple">Resend code</AppText>
            </Pressable>

            {error ? <AuthErrorBanner message={error} /> : null}
          </View>
        </ScrollView>

        <View className="border-t border-border px-6 pb-6 pt-4 dark:border-white/10">
          <Button size="lg" fullWidth className="h-14 rounded-[24px]" onPress={handleSubmit} disabled={!isValidOtp && !isAuthenticated} loading={loading}>
            Verify & Continue
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
