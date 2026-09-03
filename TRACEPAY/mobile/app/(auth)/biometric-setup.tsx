import { router } from "expo-router";
import { ScanFace } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TracePayIcon from "../../assets/icons/assembled TracePay icon.svg";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import { Button } from "../../src/components/ui/Button";
import { COLORS } from "../../src/theme/colors";

export default function BiometricSetupScreen() {
  const {
    biometricAvailability,
    enableBiometrics,
    skipBiometrics,
  } = useAppLock();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const continueToConsent = () => {
    router.replace("/(auth)/sms-consent");
  };

  const handleEnable = async () => {
    setIsBusy(true);
    setMessage(null);
    const enabled = await enableBiometrics();
    setIsBusy(false);

    if (enabled) {
      continueToConsent();
      return;
    }
    setMessage("Biometric authentication was not completed.");
  };

  const handleSkip = async () => {
    setIsBusy(true);
    await skipBiometrics();
    continueToConsent();
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center px-[30px] pb-7 pt-9">
        <TracePayIcon width={80} height={70} />
        <View className="mt-14 h-24 w-24 items-center justify-center">
          <ScanFace color={palette.primary} size={46} strokeWidth={1.75} />
        </View>

        <Text className="mt-[30px] text-[30px] font-bold tracking-[-0.7px] text-foreground">
          Unlock faster
        </Text>
        <Text className="mt-3 max-w-[340px] text-center text-[15px] leading-[23px] text-muted-foreground">
          {biometricAvailability.available
            ? "Use Face ID to unlock TracePay on this device. Your PIN will always remain available."
            : "Biometric authentication is not available or enrolled on this device. You can continue using your PIN."}
        </Text>

        {message ? (
          <Text
            accessibilityLiveRegion="polite"
            className="mt-[18px] text-center text-[13px] text-destructive"
          >
            {message}
          </Text>
        ) : null}

        <View className="mt-auto w-full max-w-[360px] gap-3">
          {biometricAvailability.available ? (
            <Button loading={isBusy} onPress={handleEnable}>
              Enable Face ID
            </Button>
          ) : null}

          <Button
            disabled={isBusy}
            onPress={handleSkip}
            size="md"
            variant="ghost"
            labelClassName="text-muted-foreground"
          >
            {biometricAvailability.available ? "Not now" : "Continue with PIN"}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
