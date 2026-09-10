import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { PasswordInput } from "../../src/components/ui/PasswordInput";
import { getPendingPhone } from "../../src/features/auth/auth.service";
import { isValidPassword } from "../../src/features/auth/auth.validation";
import { useAuth } from "../../src/hooks/useAuth";
import { COLORS } from "../../src/theme/colors";

export default function Screen() {
  const { error, submitting, updatePassword } = useAuth();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone =
    typeof params.phone === "string" && params.phone.length > 0
      ? params.phone
      : getPendingPhone() ?? undefined;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current || submitting) {
      return;
    }

    const nextPasswordError = isValidPassword(password)
      ? null
      : "Use at least 8 characters.";
    const nextConfirmError =
      password === confirmPassword ? null : "Passwords do not match.";

    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);

    if (nextPasswordError || nextConfirmError) {
      return;
    }

    submittingRef.current = true;
    try {
      await updatePassword(password, phone);
      router.replace("/(auth)/password-updated");
    } catch {
      return;
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 px-7 pt-4">
          <IconButton
            accessibilityLabel="Go back"
            variant="ghost"
            onPress={() => router.back()}
          >
            <Ionicons
              color={palette.mutedForeground}
              name="chevron-back"
              size={22}
            />
          </IconButton>

          <ScrollView
            className="flex-1"
            contentContainerClassName="pt-6 pb-8"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-center text-[28px] font-bold text-foreground">
              Create a new password
            </Text>
            <Text className="mt-3 text-center text-[15px] leading-[22px] text-muted-foreground">
              Choose a strong password to keep your TracePay account secure.
            </Text>

            <View className="mt-10 gap-3.5">
              <PasswordInput
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                editable={!submitting}
                error={passwordError}
                label="New password"
                onChangeText={(value) => {
                  setPassword(value);
                  setPasswordError(null);
                }}
                placeholder="At least 8 characters"
                textContentType="newPassword"
                value={password}
              />
              <PasswordInput
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                editable={!submitting}
                error={confirmError}
                label="Confirm password"
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  setConfirmError(null);
                }}
                placeholder="Re-enter password"
                textContentType="newPassword"
                value={confirmPassword}
              />
            </View>

            {error ? (
              <Text
                accessibilityLiveRegion="polite"
                className="mt-4 text-center text-[13px] text-destructive"
              >
                {error}
              </Text>
            ) : null}
          </ScrollView>

          <View className="pb-8">
            <Button
              disabled={password.length === 0 || confirmPassword.length === 0}
              loading={submitting}
              onPress={() => {
                void handleSubmit();
              }}
            >
              Update password
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
