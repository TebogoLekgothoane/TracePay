import { router } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SuccessCelebration } from "../../src/components/feedback/SuccessCelebration";
import { Button } from "../../src/components/ui/Button";

export default function ResetPinSuccessScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-7">
        <SuccessCelebration
          subtitle="Your new TracePay PIN is ready to use."
          title="PIN reset complete"
        />

        <View className="pb-5">
          <Button onPress={() => router.replace("/(auth)/unlock")}>
            Return to unlock
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
