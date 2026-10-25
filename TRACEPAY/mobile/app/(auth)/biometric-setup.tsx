import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Constants from "expo-constants";
import { ScanFace } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TracePayIcon from "../../assets/icons/assembled TracePay icon.svg";
import { Button } from "../../src/components/ui/Button";
import { resolveAuthenticatedHomeHref } from "../../src/features/auth/auth.navigation";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import {
  biometricUnavailableCopy,
  getBiometricAvailability,
} from "../../src/features/security/biometric.service";
import { COLORS } from "../../src/theme/colors";

const isExpoGo = Constants.appOwnership === "expo";
const faceIdBlockedInExpoGo = Platform.OS === "ios" && isExpoGo;

export default function BiometricSetupScreen() {
  const params = useLocalSearchParams<{ flow?: string }>();
  const {
    biometricAvailability,
    disableBiometrics,
    enableBiometrics,
  } = useAppLock();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [availability, setAvailability] = useState(biometricAvailability);
  const isSignupFlow = params.flow === "signup";
  const biometricName = availability.label ?? "biometrics";
  const canEnable = availability.available && !faceIdBlockedInExpoGo;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getBiometricAvailability()
        .then((next) => {
          if (active) {
            setAvailability(next);
          }
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  const continueToApp = () => {
    if (isSignupFlow) {
      router.replace({
        pathname: "/(auth)/financial-data-consent",
        params: { flow: "signup" },
      });
      return;
    }
    void resolveAuthenticatedHomeHref().then((href) => router.replace(href));
  };

  const handleEnable = async () => {
    setIsBusy(true);
    setMessage(null);
    const result = await enableBiometrics().catch(() => ({
      enabled: false,
      message: undefined,
    }));
    setIsBusy(false);

    if (result.enabled) {
      continueToApp();
      return;
    }
    setMessage(
      result.message ??
        `${biometricName} authentication was not completed.`,
    );
  };

  const handleSkip = async () => {
    setIsBusy(true);
    await disableBiometrics().catch(() => undefined);
    continueToApp();
  };

  const description = faceIdBlockedInExpoGo
    ? "Face ID cannot run inside Expo Go. Continue with your PIN for now, then install a TracePay development build to enable Face ID."
    : availability.available
      ? `Use ${biometricName} to unlock your signed-in TracePay session without typing your password each time. ${biometricName} stays on your device — TracePay never sees it — and your PIN always works as a backup.`
      : biometricUnavailableCopy(availability.unavailableReason);

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
          {description}
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
          {canEnable ? (
            <Button loading={isBusy} onPress={handleEnable}>
              {`Enable ${biometricName}`}
            </Button>
          ) : null}

          <Button
            disabled={isBusy}
            onPress={handleSkip}
            size="md"
            variant={canEnable ? "ghost" : "primary"}
            labelClassName={canEnable ? "text-muted-foreground" : undefined}
          >
            {canEnable ? "Not now" : "Continue with PIN"}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
