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
import { AuthError, isPhoneAlreadyRegisteredError } from "@/lib/auth-errors";
import { isValidSaPhone } from "@/lib/phone";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";

export default function CreateAccountScreen() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneAlreadyRegistered, setPhoneAlreadyRegistered] = useState(false);
  const signUpWithPassword = useProfileStore((s) => s.signUpWithPassword);
  const { colors } = useColorScheme();

  const isValid =
    fullName.trim().length > 1 &&
    isValidSaPhone(phone) &&
    password.length >= 8 &&
    password === confirmPassword;

  const goToSignIn = () => {
    router.push({
      pathname: "/(auth)/sign-in",
      params: phone ? { phone } : undefined,
    });
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setError("");
    setPhoneAlreadyRegistered(false);
    setLoading(true);
    try {
      await signUpWithPassword(fullName, phone, password);
      const authed = useProfileStore.getState().isAuthenticated;
      router.push(authed ? "/(onboarding)/biometrics" : "/(onboarding)/otp");
    } catch (e: unknown) {
      if (isPhoneAlreadyRegisteredError(e)) {
        setPhoneAlreadyRegistered(true);
        setError(e instanceof Error ? e.message : "This phone number is already registered. Sign in instead.");
      } else {
        setError(e instanceof AuthError ? e.message : "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-transparent" edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 }}
        >
          <AppText variant="display" className="mt-4">
            Create your{"\n"}
            <AppText variant="displayAccent">account</AppText>
          </AppText>
          <AppText variant="lead" className="mt-3">
            Set up TracePay with your name, phone number, and a secure password.
          </AppText>

          <View className="mt-8 gap-5">
            <View>
              <AppText variant="label" className="mb-2">Full name</AppText>
              <GlassInput>
                <MaterialCommunityIcons name="account-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  className="flex-1 text-[15px] text-foreground"
                  placeholder="Your full name"
                  placeholderTextColor={colors.mutedForeground}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </GlassInput>
            </View>

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
                  onChangeText={(value) => {
                    setPhone(value);
                    if (phoneAlreadyRegistered) {
                      setPhoneAlreadyRegistered(false);
                      setError("");
                    }
                  }}
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
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <MaterialCommunityIcons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={colors.primary}
                  />
                </Pressable>
              </GlassInput>
            </View>

            <View>
              <AppText variant="label" className="mb-2">Confirm password</AppText>
              <GlassInput>
                <MaterialCommunityIcons name="lock-check-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  className="flex-1 text-[15px] text-foreground"
                  placeholder="Re-enter password"
                  placeholderTextColor={colors.mutedForeground}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </GlassInput>
            </View>

            {error ? <AuthErrorBanner message={error} /> : null}

            {phoneAlreadyRegistered ? (
              <Button size="lg" fullWidth className="h-14 rounded-[24px]" onPress={goToSignIn}>
                Sign in with this number
              </Button>
            ) : (
              <Pressable onPress={goToSignIn} hitSlop={8}>
                <AppText variant="bodySm" className="font-semibold text-brand-purple dark:text-primary">
                  Already have an account? Sign in
                </AppText>
              </Pressable>
            )}
          </View>
        </ScrollView>

        <View className="border-t border-border px-6 pb-6 pt-4 dark:border-white/10">
          <Button
            size="lg"
            fullWidth
            className="h-14 rounded-[24px]"
            onPress={handleSubmit}
            disabled={!isValid || phoneAlreadyRegistered}
            loading={loading}
          >
            Continue
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
