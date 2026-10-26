import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { signOut } from "../../src/features/auth/auth.service";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import { COLORS } from "../../src/theme/colors";

/**
 * A forgotten PIN is recovered by proving account ownership again, not by a
 * local code: the local unlock is wiped, the session is signed out, and the
 * user signs in with phone number + password (and OTP) before creating a
 * new PIN. Reopening the app cannot skip this.
 */
export default function ResetPinScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { clearDeviceLock } = useAppLock();
  const [busy, setBusy] = useState(false);

  const signInAgain = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await signOut();
      await clearDeviceLock();
      router.replace("/(auth)/welcome");
    } catch {
      setBusy(false);
      Alert.alert("Could not reset your PIN", "Please try again.");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center px-6 pb-5">
        <IconButton
          accessibilityLabel="Back to unlock"
          className="self-start"
          disabled={busy}
          variant="ghost"
          onPress={() => router.replace("/(auth)/unlock")}
        >
          <Ionicons color={palette.mutedForeground} name="chevron-back" size={24} />
        </IconButton>

        <View className="mt-[72px] h-[92px] w-[92px] items-center justify-center">
          <Ionicons color={palette.primary} name="shield-checkmark-outline" size={42} />
        </View>

        <Text className="mt-[26px] text-[28px] font-bold tracking-[-0.6px] text-foreground">
          Reset PIN
        </Text>
        <Text className="mt-2.5 max-w-[330px] text-center text-[14px] leading-[21px] text-muted-foreground">
          To keep your account safe, you need to sign in again with your mobile
          number and password before creating a new PIN. We'll send a
          verification code to your phone.
        </Text>
        <Text className="mt-3 max-w-[330px] text-center text-[13px] leading-[19px] text-muted-foreground">
          Biometric unlock will be turned off on this device until you enable it
          again.
        </Text>

        <View className="mt-auto w-full max-w-[360px] gap-3">
          <Button loading={busy} onPress={() => void signInAgain()}>
            Sign in again
          </Button>
          <Button
            disabled={busy}
            onPress={() => router.replace("/(auth)/unlock")}
            variant="ghost"
            labelClassName="text-muted-foreground"
          >
            I remember my PIN
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
