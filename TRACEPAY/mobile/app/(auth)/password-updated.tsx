import { router } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SuccessCelebration } from "../../src/components/feedback/SuccessCelebration";
import { Button } from "../../src/components/ui/Button";
import { continueAfterAuth } from "../../src/features/auth/auth.navigation";
import { useAppLock } from "../../src/features/security/AppLockProvider";

export default function PasswordUpdatedScreen() {
  const { hasPin, lockApp, unlockApp } = useAppLock();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-7">
        <SuccessCelebration
          subtitle="Your password has been changed. You can keep using TracePay on this device."
          title="Password updated"
        />

        <View className="pb-5">
          <Button
            onPress={() =>
              void continueAfterAuth({ hasPin, lockApp, router, unlockApp })
            }
          >
            Continue
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
