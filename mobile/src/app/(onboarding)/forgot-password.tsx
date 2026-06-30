import React, { useEffect, useState } from "react";
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
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Button } from "@/components/Button";
import { GlassInput } from "@/components/GlassInput";
import { AppText } from "@/components/Typography";
import { AuthError } from "@/lib/auth-errors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";

const robotSource = require("@/assets/images/robot.png");

type Step = "email" | "reset" | "success";

function AuthErrorBanner({ message }: { message: string }) {
  return (
    <View className="flex-row items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 dark:border-red-900/50 dark:bg-red-950/40">
      <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#DC2626" />
      <AppText variant="bodySm" className="flex-1 text-red-700 dark:text-red-300">
        {message}
      </AppText>
    </View>
  );
}

export default function ForgotPasswordScreen() {
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { accountExistsForEmail, resetPassword } = useProfileStore();
  const { colors, isDarkColorScheme } = useColorScheme();

  useEffect(() => {
    if (typeof emailParam === "string" && emailParam.length > 0) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  const normalizedEmail = email.trim().toLowerCase();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const passwordsMatch = password.length >= 6 && password === confirmPassword;

  const handleVerifyEmail = async () => {
    if (!isValidEmail) return;
    setError("");
    setLoading(true);
    try {
      const exists = await accountExistsForEmail(normalizedEmail);
      if (!exists) {
        throw new AuthError("No account found with this email.");
      }
      setStep("reset");
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!passwordsMatch) return;
    setError("");
    setLoading(true);
    try {
      await resetPassword(normalizedEmail, password);
      setStep("success");
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "reset") {
      setStep("email");
      setPassword("");
      setConfirmPassword("");
      setError("");
      return;
    }
    router.back();
  };

  const primaryLabel =
    step === "success"
      ? "Back to Sign In"
      : step === "reset"
        ? "Update Password"
        : "Continue";

  const primaryAction =
    step === "success"
      ? () =>
          router.replace({
            pathname: "/(onboarding)",
            params: { mode: "signin" },
          })
      : step === "reset"
        ? handleResetPassword
        : handleVerifyEmail;

  const primaryDisabled =
    step === "success" ? false : step === "reset" ? !passwordsMatch : !isValidEmail;

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-transparent"
      edges={["left", "right", "bottom", "top"]}
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
              paddingTop: 24,
              paddingBottom: 16,
            }}
          >
            <Pressable
              onPress={handleBack}
              className={
                isDarkColorScheme
                  ? "mb-8 h-10 w-10 items-center justify-center rounded-full bg-white/[0.08]"
                  : "mb-6 h-10 w-10 items-center justify-center rounded-full bg-muted"
              }
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather
                name="chevron-left"
                size={22}
                color={isDarkColorScheme ? "#FFFFFF" : colors.foreground}
              />
            </Pressable>

            <View className="relative mb-8 mt-2 min-h-[120px]">
              <Image
                source={robotSource}
                resizeMode="contain"
                className="absolute -right-1 top-0 h-[110px] w-[88px]"
                accessibilityLabel="TracePay assistant"
              />

              <View className="max-w-[72%] pr-2">
                <AppText variant="display">
                  {step === "success" ? (
                    <>
                      Password{"\n"}
                      <AppText variant="displayAccent">updated</AppText>
                    </>
                  ) : step === "reset" ? (
                    <>
                      Set a new{"\n"}
                      <AppText variant="displayAccent">password</AppText>
                    </>
                  ) : (
                    <>
                      Forgot your{"\n"}
                      <AppText variant="displayAccent">password?</AppText>
                    </>
                  )}
                </AppText>
                <AppText variant="lead" className="mt-3">
                  {step === "success"
                    ? "Your password has been updated. You can now sign in with your new password."
                    : step === "reset"
                      ? "Choose a strong password with at least 6 characters."
                      : "Enter the email linked to your TracePay account."}
                </AppText>
              </View>
            </View>

            {step === "email" ? (
              <View className="gap-5">
                <View>
                  <AppText variant="label" className="mb-2">
                    Email address
                  </AppText>
                  <GlassInput>
                    <MaterialCommunityIcons
                      name="email-outline"
                      size={18}
                      color={colors.mutedForeground}
                    />
                    <TextInput
                      className="flex-1 py-0.5 text-[15px] text-foreground"
                      placeholder="you@example.com"
                      placeholderTextColor={colors.mutedForeground}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      returnKeyType="done"
                      onSubmitEditing={handleVerifyEmail}
                    />
                  </GlassInput>
                </View>

                {error ? <AuthErrorBanner message={error} /> : null}
              </View>
            ) : null}

            {step === "reset" ? (
              <View className="gap-5">
                <View>
                  <AppText variant="label" className="mb-2">
                    New password
                  </AppText>
                  <GlassInput>
                    <MaterialCommunityIcons
                      name="lock-outline"
                      size={18}
                      color={colors.mutedForeground}
                    />
                    <TextInput
                      className="flex-1 py-0.5 text-[15px] text-foreground"
                      placeholder="At least 6 characters"
                      placeholderTextColor={colors.mutedForeground}
                      value={password}
                      onChangeText={setPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      returnKeyType="next"
                    />
                  </GlassInput>
                </View>

                <View>
                  <AppText variant="label" className="mb-2">
                    Confirm password
                  </AppText>
                  <GlassInput>
                    <MaterialCommunityIcons
                      name="lock-check-outline"
                      size={18}
                      color={colors.mutedForeground}
                    />
                    <TextInput
                      className="flex-1 py-0.5 text-[15px] text-foreground"
                      placeholder="Re-enter your password"
                      placeholderTextColor={colors.mutedForeground}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      returnKeyType="done"
                      onSubmitEditing={handleResetPassword}
                    />
                  </GlassInput>
                  {confirmPassword.length > 0 && password !== confirmPassword ? (
                    <AppText variant="caption" className="mt-2 text-red-500">
                      Passwords do not match
                    </AppText>
                  ) : null}
                </View>

                {error ? <AuthErrorBanner message={error} /> : null}
              </View>
            ) : null}

            {step === "success" ? (
              <View className="flex-row items-start gap-2 rounded-2xl border border-green-200 bg-green-50 px-3.5 py-3 dark:border-green-900/50 dark:bg-green-950/40">
                <MaterialCommunityIcons name="check-circle-outline" size={18} color="#16A34A" />
                <AppText variant="bodySm" className="flex-1 text-green-800 dark:text-green-300">
                  Your password was saved on this device.
                </AppText>
              </View>
            ) : null}
          </ScrollView>

          <View className="z-10 border-t border-border bg-background px-6 pb-6 pt-4 dark:border-white/10 dark:bg-transparent">
            <Button
              size="lg"
              fullWidth
              className="h-14 rounded-[24px]"
              onPress={primaryAction}
              disabled={primaryDisabled}
              loading={loading && step !== "success"}
            >
              {primaryLabel}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
