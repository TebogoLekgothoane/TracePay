import { router } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { continueAfterAuth } from "../../src/features/auth/auth.navigation";
import { useAppLock } from "../../src/features/security/AppLockProvider";

export default function Screen() {
  const { hasPin, lockApp, unlockApp } = useAppLock();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-7 pt-10">
        <View className="flex-1 items-center justify-center">
          <Text className="text-center text-[28px] font-bold text-foreground">
            Password updated
          </Text>
          <Text className="mt-3 max-w-[320px] text-center text-[15px] leading-[22px] text-muted-foreground">
            Your password has been changed. You can keep using TracePay on this device.
          </Text>
        </View>

        <View className="pb-8">
          <Button
            onPress={() => {
              continueAfterAuth({ hasPin, lockApp, router, unlockApp });
            }}
          >
            Continue
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
