import { router } from "expo-router";
import {
  ChevronLeft,
  EyeOff,
  Fingerprint,
  KeyRound,
  Shield,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { usePrivacyPreferences } from "../../src/features/privacy/privacy.preferences";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import { COLORS } from "../../src/theme/colors";

export default function SecurityScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const {
    biometricAvailability,
    biometricsEnabled,
    enableBiometrics,
    hasPin,
    isHydrated,
    skipBiometrics,
  } = useAppLock();
  const {
    hideBalances,
    hydrated: privacyHydrated,
    setHideBalances,
  } = usePrivacyPreferences();
  const [updatingBiometrics, setUpdatingBiometrics] = useState(false);
  const [updatingBalances, setUpdatingBalances] = useState(false);

  const biometricLabel = biometricAvailability.label ?? "Biometrics";
  const canUseBiometrics = biometricAvailability.available;

  const handleBiometricsChange = (enabled: boolean) => {
    if (updatingBiometrics || !hasPin) {
      return;
    }

    setUpdatingBiometrics(true);
    void (async () => {
      try {
        if (enabled) {
          const ok = await enableBiometrics();
          if (!ok) {
            Alert.alert(
              `Could not enable ${biometricLabel}`,
              "Authenticate with your device biometrics and try again.",
            );
          }
          return;
        }

        await skipBiometrics();
      } catch {
        Alert.alert(
          "Could not update security",
          "Please try again in a moment.",
        );
      } finally {
        setUpdatingBiometrics(false);
      }
    })();
  };

  const handleHideBalancesChange = (enabled: boolean) => {
    if (updatingBalances) {
      return;
    }

    setUpdatingBalances(true);
    void setHideBalances(enabled)
      .catch(() => {
        Alert.alert(
          "Could not update preference",
          "Please try again in a moment.",
        );
      })
      .finally(() => {
        setUpdatingBalances(false);
      });
  };

  const handleSetupPin = () => {
    router.push("/(auth)/device-security");
  };

  const handleChangePin = () => {
    Alert.alert(
      "Change app PIN",
      "You will set a new PIN for unlocking TracePay on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => router.push("/(auth)/device-security"),
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
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
                Security & privacy
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                Protect access to TracePay on this device
              </Text>
            </View>
          </View>

          <Text className="mb-3 mt-6 text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
            App lock
          </Text>

          <View className="gap-2 rounded-3xl bg-card p-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <KeyRound color={palette.primary} size={18} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-semibold text-foreground">
                  Device PIN
                </Text>
                <Text className="mt-0.5 text-[13px] text-muted-foreground">
                  {!isHydrated
                    ? "Checking…"
                    : hasPin
                      ? "Required when you reopen TracePay"
                      : "Not set up on this device"}
                </Text>
              </View>
              <Text className="text-[13px] font-semibold text-muted-foreground">
                {!isHydrated ? "…" : hasPin ? "On" : "Off"}
              </Text>
            </View>

            {hasPin ? (
              <Pressable
                accessibilityRole="button"
                className="mt-2 rounded-2xl bg-muted px-4 py-3 active:opacity-75"
                onPress={handleChangePin}
              >
                <Text className="text-center text-[14px] font-semibold text-primary">
                  Change PIN
                </Text>
              </Pressable>
            ) : (
              <Button className="mt-2" onPress={handleSetupPin} size="md">
                Set up PIN
              </Button>
            )}
          </View>

          <View className="mt-3 flex-row items-center gap-3 rounded-3xl bg-card px-4 py-3.5">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Fingerprint color={palette.primary} size={18} strokeWidth={2.2} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-semibold text-foreground">
                {biometricLabel}
              </Text>
              <Text className="mt-0.5 text-[13px] text-muted-foreground">
                {!canUseBiometrics
                  ? "Not available on this device"
                  : !hasPin
                    ? "Set up a PIN first"
                    : `Unlock TracePay with ${biometricLabel}`}
              </Text>
            </View>
            <Switch
              accessibilityLabel={`Toggle ${biometricLabel}`}
              disabled={
                !isHydrated ||
                !hasPin ||
                !canUseBiometrics ||
                updatingBiometrics
              }
              onValueChange={handleBiometricsChange}
              trackColor={{
                false: palette.border,
                true: palette.primary,
              }}
              value={biometricsEnabled && canUseBiometrics}
            />
          </View>

          <Text className="mb-3 mt-6 text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
            Home privacy
          </Text>
          <View className="flex-row items-center gap-3 rounded-3xl bg-card px-4 py-3.5">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <EyeOff color={palette.primary} size={18} strokeWidth={2.2} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-semibold text-foreground">
                Hide balances on Home
              </Text>
              <Text className="mt-0.5 text-[13px] text-muted-foreground">
                Mask total and account balances until you reveal them
              </Text>
            </View>
            <Switch
              accessibilityLabel="Hide balances on Home"
              disabled={!privacyHydrated || updatingBalances}
              onValueChange={handleHideBalancesChange}
              trackColor={{
                false: palette.border,
                true: palette.primary,
              }}
              value={hideBalances}
            />
          </View>

          <Text className="mb-3 mt-6 text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
            Privacy
          </Text>
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
            onPress={() => router.push("/settings/privacy")}
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Shield color={palette.primary} size={18} strokeWidth={2.2} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-semibold text-foreground">
                Privacy & consent
              </Text>
              <Text className="mt-0.5 text-[13px] text-muted-foreground">
                How TracePay uses your statements
              </Text>
            </View>
            <Text className="text-[13px] font-medium text-primary">View</Text>
          </Pressable>

          <Text className="mt-5 text-[13px] leading-5 text-muted-foreground">
            TracePay locks automatically after you leave the app. Your bank login
            credentials are never stored.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
