import React, { useState } from "react";
import {
  View,
  TextInput,
  Image,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { GlassInput } from "@/components/GlassInput";
import { AppText } from "@/components/Typography";
import { AuthErrorBanner } from "@/components/AuthErrorBanner";
import { AuthError } from "@/lib/auth-errors";
import { isValidSaPhone, normalizeSaPhone } from "@/lib/phone";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";

const robotSource = require("@/assets/images/robot.png");

type AuthStep = "phone" | "verify";

export default function AuthScreen() {
  const [step, setStep] = useState<AuthStep>("phone");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { sendPhoneCode, verifyPhoneCode, resendPhoneCode } = useProfileStore();
  const { colors } = useColorScheme();

  const cleanPhone = normalizeSaPhone(phone);
  const isValidPhone = isValidSaPhone(phone);
  const isValidOtp = otpCode.replace(/\s/g, "").length >= 6;
  const isValid = step === "verify" ? isValidOtp : isValidPhone;

  const handleSubmit = async () => {
    if (!isValid) return;
    setError("");
    setLoading(true);
    try {
      if (step === "phone") {
        await sendPhoneCode(cleanPhone);
        setStep("verify");
        setOtpCode("");
        return;
      }

      await verifyPhoneCode(otpCode);
      router.replace("/(onboarding)/language");
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError("");
    setLoading(true);
    try {
      await resendPhoneCode();
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Could not resend code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackFromVerify = () => {
    setStep("phone");
    setOtpCode("");
    setError("");
  };

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-transparent"
      edges={["left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 100,
              paddingBottom: 16,
            }}
          >
            {/* Hero — full-width copy, robot tucked top-right */}
            <View className="relative mb-8 mt-4 min-h-[130px]">
              <Image
                source={robotSource}
                resizeMode="contain"
                className="absolute -right-1 top-0 h-[120px] w-[120px]"
                accessibilityLabel="TracePay assistant"
              />

              <View className="max-w-[72%] pr-2">
                <AppText variant="display">
                  {step === "verify" ? (
                    <>
                      Verify your{"\n"}
                      <AppText variant="displayAccent">phone</AppText>
                    </>
                  ) : (
                    <>
                      Continue with{"\n"}
                      <AppText variant="displayAccent">phone</AppText>
                    </>
                  )}
                </AppText>
                <AppText variant="lead" className="mt-3">
                  {step === "verify"
                    ? `Enter the 6-digit code we sent to ${cleanPhone}.`
                    : "Use your South African mobile number to create or access your TracePay account."}
                </AppText>
              </View>
            </View>

            {step === "verify" ? (
              <View className="gap-5">
                <View>
                  <AppText variant="label" className="mb-2">
                    Verification code
                  </AppText>
                  <GlassInput>
                    <MaterialCommunityIcons
                      name="message-text-outline"
                      size={18}
                      color={colors.mutedForeground}
                    />
                    <TextInput
                      className="flex-1 py-0.5 text-[15px] text-foreground"
                      placeholder="6-digit code"
                      placeholderTextColor={colors.mutedForeground}
                      value={otpCode}
                      onChangeText={setOtpCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                    />
                  </GlassInput>
                </View>

                <Pressable onPress={handleResendCode} disabled={loading} accessibilityRole="button">
                  <AppText variant="bodySm" className="font-semibold text-brand-purple">
                    Resend code
                  </AppText>
                </Pressable>

                <Pressable onPress={handleBackFromVerify} accessibilityRole="button">
                  <AppText variant="bodySm" className="text-muted-foreground">
                    Change phone number
                  </AppText>
                </Pressable>

                {error ? <AuthErrorBanner message={error} /> : null}
              </View>
            ) : (
              <View className="gap-5">
                <View>
                  <AppText variant="label" className="mb-2">
                    SA phone number
                  </AppText>
                  <GlassInput>
                    <MaterialCommunityIcons
                      name="phone-outline"
                      size={18}
                      color={colors.mutedForeground}
                    />
                    <AppText variant="body" className="shrink-0 font-medium text-muted-foreground">
                      +27
                    </AppText>
                    <TextInput
                      className="min-w-0 flex-1 py-0.5 text-[15px] text-foreground"
                      placeholder="72 123 4567"
                      placeholderTextColor={colors.mutedForeground}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                    />
                  </GlassInput>
                  <AppText variant="bodySm" className="mt-3 text-muted-foreground">
                    Your verified number becomes your sign-in for TracePay. You can add an
                    email later for recovery.
                  </AppText>
                </View>

                <Pressable
                  onPress={() => router.push("/(onboarding)/forgot-password")}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <AppText variant="bodySm" className="font-semibold text-brand-purple">
                    Need help recovering access?
                  </AppText>
                </Pressable>

                {error ? <AuthErrorBanner message={error} /> : null}
              </View>
            )}
          </ScrollView>

          <View className="z-10 border-t border-border bg-background px-6 pb-6 pt-4 dark:border-white/10 dark:bg-transparent">
            <Button
              size="lg"
              fullWidth
              className="h-14 rounded-[24px]"
              onPress={handleSubmit}
              disabled={!isValid}
              loading={loading}
              iconRight={
                !loading ? (
                  <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
                ) : undefined
              }
            >
              {step === "verify" ? "Verify & Continue" : "Send Verification Code"}
            </Button>

            <View className="mt-4 flex-row items-center justify-center">
              <MaterialCommunityIcons
                name="shield-lock-outline"
                size={13}
                color={colors.mutedForeground}
              />
              <AppText variant="caption" className="ml-1.5 text-center">
                POPIA compliant · Secured with encrypted auth
              </AppText>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
