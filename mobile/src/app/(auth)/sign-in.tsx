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
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Button } from "@/components/Button";
import { GlassInput } from "@/components/GlassInput";
import { AppText } from "@/components/Typography";
import { AuthErrorBanner } from "@/components/AuthErrorBanner";
import { AuthError } from "@/lib/auth-errors";
import { isValidSaPhone } from "@/lib/phone";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";
import { useDeviceAuthStore } from "@/stores/deviceAuthStore";

function readPhoneParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export default function SignInScreen() {
  const params = useLocalSearchParams<{ phone?: string | string[] }>();
  const [phone, setPhone] = useState(() => readPhoneParam(params.phone));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const signInWithPassword = useProfileStore((s) => s.signInWithPassword);
  const { colors } = useColorScheme();
  const canGoBack = router.canGoBack();

  const isValid = isValidSaPhone(phone) && password.length > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setError("");
    setLoading(true);
    try {
      await signInWithPassword(phone, password);
      const complete = useProfileStore.getState().onboardingComplete;
      const { pinEnabled: hasPin } = useDeviceAuthStore.getState();
      const { consentGiven: hasConsent } = useProfileStore.getState();
      if (complete) {
        router.replace("/(tabs)");
      } else if (!hasPin) {
        router.replace("/(onboarding)/biometrics");
      } else if (!hasConsent) {
        router.replace("/(onboarding)/consent");
      } else {
        router.replace("/(onboarding)/sms-permission");
      }
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-transparent"
      edges={["top", "left", "right", "bottom"]}
    >
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {canGoBack ? (
          <View className="px-6 pt-2">
            <Pressable
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-muted/60 dark:bg-white/10"
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name="chevron-left" size={22} color={colors.foreground} />
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: canGoBack ? 8 : 24,
            paddingBottom: 16,
          }}
        >
          <AppText variant="display">
            Sign in to{"\n"}
            <AppText variant="displayAccent">TracePay</AppText>
          </AppText>
          <AppText variant="lead" className="mt-3">
            Use the phone number and password from when you created your account.
          </AppText>

          <View className="mt-8 gap-5">
            <View>
              <AppText variant="label" className="mb-2">SA phone number</AppText>
              <GlassInput>
                <MaterialCommunityIcons name="phone-outline" size={18} color={colors.mutedForeground} />
                <AppText variant="body" className="shrink-0 font-medium text-muted-foreground">+27</AppText>
                <TextInput
                  className="min-w-0 flex-1 text-[15px] text-foreground"
                  placeholder="72 123 4567"
                  placeholderTextColor={colors.mutedForeground}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </GlassInput>
            </View>

            <View>
              <AppText variant="label" className="mb-2">Password</AppText>
              <GlassInput>
                <MaterialCommunityIcons name="lock-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  className="flex-1 text-[15px] text-foreground"
                  placeholder="Your password"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <MaterialCommunityIcons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </GlassInput>
              <Pressable
                onPress={() => router.push("/(onboarding)/forgot-password")}
                className="mt-2 self-end py-1"
                hitSlop={8}
              >
                <AppText variant="bodySm" className="font-semibold text-brand-purple dark:text-primary">
                  Forgot your password?
                </AppText>
              </Pressable>
            </View>

            {error ? <AuthErrorBanner message={error} /> : null}

            <Pressable onPress={() => router.push("/(onboarding)/create-account")} hitSlop={8} className="py-1">
              <AppText variant="bodySm" className="font-semibold text-brand-purple dark:text-primary">
                New here? Create an account
              </AppText>
            </Pressable>
          </View>
        </ScrollView>

        <View className="border-t border-border px-6 pb-6 pt-4 dark:border-white/10">
          <Button
            size="lg"
            fullWidth
            className="h-14 rounded-[24px]"
            onPress={handleSubmit}
            disabled={!isValid}
            loading={loading}
          >
            Sign In
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
