import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { AppText } from "@/components/Typography";
import { AuthErrorBanner } from "@/components/AuthErrorBanner";
import { AuthError } from "@/lib/auth-errors";
import { useProfileStore } from "@/stores/profileStore";

export default function OtpScreen() {
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<TextInput>(null);
  const lastSubmittedCode = useRef("");
  const { phone, verifySignUpOtp, resendSignUpOtp, isAuthenticated } = useProfileStore();

  const isValidOtp = otpCode.replace(/\s/g, "").length >= 6;

  const handleSubmit = useCallback(
    async (code: string) => {
      const normalizedCode = code.replace(/\s/g, "");
      if (normalizedCode.length < 6 || loading) return;
      setError("");
      setLoading(true);
      try {
        if (isAuthenticated) {
          router.replace("/(onboarding)/biometrics");
          return;
        }
        await verifySignUpOtp(normalizedCode);
        router.replace("/(onboarding)/biometrics");
      } catch (e) {
        setError(e instanceof AuthError ? e.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, loading, verifySignUpOtp],
  );

  useEffect(() => {
    if (otpCode.length !== 6) {
      lastSubmittedCode.current = "";
      return;
    }

    if (lastSubmittedCode.current === otpCode || loading) {
      return;
    }

    lastSubmittedCode.current = otpCode;
    void handleSubmit(otpCode);
  }, [otpCode, loading, handleSubmit]);

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
              <Pressable
                onPress={() => inputRef.current?.focus()}
                className="flex-row justify-between gap-2"
                accessibilityRole="button"
                accessibilityLabel="Enter verification code"
              >
                {Array.from({ length: 6 }, (_, index) => {
                  const digit = otpCode[index];
                  const isFilled = Boolean(digit);
                  const isActive = index === otpCode.length && otpCode.length < 6;

                  return (
                    <View
                      key={index}
                      className={[
                        "h-12 flex-1 items-center justify-center rounded-[8px] border",
                        isFilled
                          ? "border-primary bg-primary/10"
                          : isActive
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background dark:border-white/10 dark:bg-white/[0.04]",
                      ].join(" ")}
                    >
                      <AppText variant="title" className={isFilled ? "text-primary" : "text-foreground"}>
                        {digit || ""}
                      </AppText>
                    </View>
                  );
                })}
              </Pressable>
              <TextInput
                ref={inputRef}
                className="absolute h-0 w-0 opacity-0"
                value={otpCode}
                onChangeText={(value) => {
                  const digitsOnly = value.replace(/\D/g, "").slice(0, 6);
                  setOtpCode(digitsOnly);
                  setError("");
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                textContentType="oneTimeCode"
              />
            </View>

            <Pressable onPress={handleResend} disabled={loading}>
              <AppText variant="bodySm" className="font-semibold text-brand-purple dark:text-primary">Resend code</AppText>
            </Pressable>

            {error ? <AuthErrorBanner message={error} /> : null}
          </View>
        </ScrollView>

        <View className="border-t border-border px-6 pb-6 pt-4 dark:border-white/10">
          <Button
            size="lg"
            fullWidth
            className="h-14 rounded-[24px]"
            onPress={() => handleSubmit(otpCode)}
            disabled={!isValidOtp && !isAuthenticated}
            loading={loading}
          >
            Verify & Continue
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
