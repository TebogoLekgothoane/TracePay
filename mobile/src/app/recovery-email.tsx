import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { AuthErrorBanner } from "@/components/AuthErrorBanner";
import { Button } from "@/components/Button";
import { GlassInput } from "@/components/GlassInput";
import { AppText } from "@/components/Typography";
import { AuthError } from "@/lib/auth-errors";
import { goBackOr } from "@/lib/navigation";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function RecoveryEmailScreen() {
  const recoveryEmail = useProfileStore((state) => state.recoveryEmail);
  const saveRecoveryEmail = useProfileStore((state) => state.saveRecoveryEmail);
  const { colors, isDarkColorScheme } = useColorScheme();

  const [email, setEmail] = useState(recoveryEmail);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const trimmedEmail = email.trim().toLowerCase();
  const hasValue = trimmedEmail.length > 0;
  const canSave = !hasValue || isValidEmail(trimmedEmail);
  const hasChanged = trimmedEmail !== recoveryEmail;
  const helperCopy = useMemo(
    () =>
      recoveryEmail
        ? "This email is used for support and future recovery flows. It does not replace phone sign-in."
        : "Add an email you can access later for support and account recovery. Your phone number stays your sign-in.",
    [recoveryEmail],
  );

  const handleSave = async () => {
    if (!canSave) return;

    setError("");
    setLoading(true);
    try {
      await saveRecoveryEmail(trimmedEmail);
      goBackOr("/(tabs)/profile");
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Could not save recovery email.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setError("");
    setLoading(true);
    try {
      await saveRecoveryEmail("");
      goBackOr("/(tabs)/profile");
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Could not remove recovery email.");
    } finally {
      setLoading(false);
    }
  };

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
        <View className="flex-1 px-6 pb-6 pt-4">
          <Pressable
            onPress={() => goBackOr("/(tabs)/profile")}
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

          <View className="mb-8">
            <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-brand-purple-light dark:bg-primary/15">
              <MaterialCommunityIcons name="email-outline" size={26} color={colors.primary} />
            </View>
            <AppText variant="display">
              Recovery{"\n"}
              <AppText variant="displayAccent">email</AppText>
            </AppText>
            <AppText variant="lead" className="mt-3">
              {helperCopy}
            </AppText>
          </View>

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
                  onSubmitEditing={handleSave}
                />
              </GlassInput>
              <AppText variant="bodySm" className="mt-3 text-muted-foreground">
                TracePay will still use SMS OTP on your phone number for sign-in.
              </AppText>
            </View>

            {error ? <AuthErrorBanner message={error} /> : null}
          </View>

          <View className="mt-auto gap-3 pt-6">
            <Button
              size="lg"
              fullWidth
              className="h-14 rounded-[24px]"
              onPress={handleSave}
              disabled={!canSave || !hasChanged}
              loading={loading}
            >
              Save Recovery Email
            </Button>

            {recoveryEmail ? (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                className="h-14 rounded-[24px]"
                onPress={handleRemove}
                disabled={loading}
              >
                Remove Recovery Email
              </Button>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
