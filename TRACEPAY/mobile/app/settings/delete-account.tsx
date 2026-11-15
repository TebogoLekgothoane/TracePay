import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { PasswordInput } from "../../src/components/ui/PasswordInput";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import { useAuth } from "../../src/hooks/useAuth";
import { COLORS } from "../../src/theme/colors";

const LOSS_ITEMS = [
  "Your profile and sign-in details",
  "Linked bank accounts",
  "Uploaded bank statements and imported files",
  "Transaction history and money insights",
] as const;

type Step = "review" | "confirm";

export default function DeleteAccountScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { clearDeviceLock } = useAppLock();
  const { deleteAccount, error, setError, submitting } = useAuth();

  const [step, setStep] = useState<Step>("review");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const handleBack = () => {
    if (submitting) {
      return;
    }
    if (step === "confirm") {
      setPassword("");
      setPasswordError(null);
      setError(null);
      setStep("review");
      return;
    }
    router.back();
  };

  const handleContinue = () => {
    setError(null);
    setPasswordError(null);
    setStep("confirm");
  };

  const handleDelete = () => {
    if (submittingRef.current || submitting) {
      return;
    }

    if (!password) {
      setPasswordError("Enter your password to continue.");
      return;
    }

    submittingRef.current = true;
    void (async () => {
      try {
        await deleteAccount(password);
      } catch {
        submittingRef.current = false;
        return;
      }

      try {
        await clearDeviceLock();
      } catch {
        // Account is already gone; continue to welcome without a PIN.
      }

      router.replace("/(auth)/welcome");
      submittingRef.current = false;
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
                onPress={handleBack}
              >
                <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
              </IconButton>
              <View className="flex-1">
                <Text className="text-[24px] font-bold text-foreground">
                  {step === "review" ? "Delete account" : "Confirm deletion"}
                </Text>
                <Text className="mt-0.5 text-[14px] text-muted-foreground">
                  {step === "review"
                    ? "Review what will be removed"
                    : "Enter your password to permanently delete your account"}
                </Text>
              </View>
            </View>

            {step === "review" ? (
              <>
                <Text className="mt-6 text-[15px] leading-6 text-foreground">
                  If you delete your TracePay account, these will be permanently
                  removed and cannot be recovered:
                </Text>

                <View className="mt-4 gap-0 overflow-hidden rounded-3xl bg-card">
                  {LOSS_ITEMS.map((item, index) => (
                    <View
                      key={item}
                      className={`px-4 py-3.5 ${
                        index < LOSS_ITEMS.length - 1
                          ? "border-b border-border"
                          : ""
                      }`}
                    >
                      <Text className="text-[15px] leading-5 text-foreground">
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text className="mt-5 text-[13px] leading-5 text-muted-foreground">
                  You can download or review your statements before deleting.
                  After deletion you will need to create a new account to use
                  TracePay again.
                </Text>

                <Button className="mt-8" onPress={handleContinue}>
                  Continue
                </Button>
                <Pressable
                  accessibilityRole="button"
                  className="mt-3 items-center py-3 active:opacity-75"
                  onPress={() => router.back()}
                >
                  <Text className="text-[15px] font-semibold text-foreground">
                    Cancel
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <View className="mt-6 rounded-3xl bg-card p-4">
                  <PasswordInput
                    autoCapitalize="none"
                    autoComplete="password"
                    autoCorrect={false}
                    editable={!submitting}
                    error={passwordError}
                    label="Password"
                    onChangeText={(value) => {
                      setPassword(value);
                      setPasswordError(null);
                      if (error) {
                        setError(null);
                      }
                    }}
                    placeholder="Enter your password"
                    value={password}
                  />
                </View>

                <Text className="mt-4 text-[13px] leading-5 text-muted-foreground">
                  This permanently deletes your account and bank statement data
                  from TracePay. This cannot be undone.
                </Text>

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
                  disabled={password.length === 0 || submitting}
                  loading={submitting}
                  onPress={handleDelete}
                  variant="destructive"
                >
                  Delete account
                </Button>
                <Pressable
                  accessibilityRole="button"
                  className="mt-3 items-center py-3 active:opacity-75"
                  disabled={submitting}
                  onPress={handleBack}
                >
                  <Text className="text-[15px] font-semibold text-foreground">
                    Go back
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
