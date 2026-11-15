import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { PasswordInput } from "../../src/components/ui/PasswordInput";
import { isValidPassword } from "../../src/features/auth/auth.validation";
import { useAuth } from "../../src/hooks/useAuth";
import { COLORS } from "../../src/theme/colors";

export default function ChangePasswordScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { changePassword, error, setError, submitting } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !submitting;

  const handleSubmit = () => {
    if (submittingRef.current || submitting) {
      return;
    }

    const nextCurrentError = currentPassword
      ? null
      : "Enter your current password.";
    const nextNewError = isValidPassword(newPassword)
      ? currentPassword && currentPassword === newPassword
        ? "Choose a new password that is different from your current one."
        : null
      : "Use at least 8 characters.";
    const nextConfirmError =
      newPassword === confirmPassword ? null : "Passwords do not match.";

    setCurrentError(nextCurrentError);
    setNewError(nextNewError);
    setConfirmError(nextConfirmError);
    setError(null);

    if (nextCurrentError || nextNewError || nextConfirmError) {
      return;
    }

    submittingRef.current = true;
    void (async () => {
      try {
        await changePassword(currentPassword, newPassword);
        Alert.alert("Password updated", "Use your new password the next time you sign in.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } catch {
        // useAuth already surfaces the message.
      } finally {
        submittingRef.current = false;
      }
    })();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-5 pt-1">
            <View className="flex-row items-center gap-3">
              <IconButton
                accessibilityLabel="Go back"
                variant="ghost"
                onPress={() => router.back()}
              >
                <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
              </IconButton>
              <View className="flex-1">
                <Text className="text-[24px] font-bold text-foreground">
                  Change password
                </Text>
                <Text className="mt-0.5 text-[14px] text-muted-foreground">
                  Update the password you use to sign in to TracePay
                </Text>
              </View>
            </View>

            <View className="mt-6 gap-3.5 rounded-3xl bg-card p-4">
              <PasswordInput
                autoCapitalize="none"
                autoComplete="password"
                autoCorrect={false}
                editable={!submitting}
                error={currentError}
                label="Current password"
                onChangeText={(value) => {
                  setCurrentPassword(value);
                  setCurrentError(null);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="Enter current password"
                value={currentPassword}
              />
              <PasswordInput
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                editable={!submitting}
                error={newError}
                label="New password"
                onChangeText={(value) => {
                  setNewPassword(value);
                  setNewError(null);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="At least 8 characters"
                value={newPassword}
              />
              <PasswordInput
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                editable={!submitting}
                error={confirmError}
                label="Confirm new password"
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  setConfirmError(null);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="Re-enter new password"
                value={confirmPassword}
              />
            </View>

            {error ? (
              <Text
                accessibilityLiveRegion="polite"
                className="mt-4 text-[13px] text-destructive"
              >
                {error}
              </Text>
            ) : null}

            <Button
              className="mt-8"
              disabled={!canSubmit}
              loading={submitting}
              onPress={handleSubmit}
            >
              Update password
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
