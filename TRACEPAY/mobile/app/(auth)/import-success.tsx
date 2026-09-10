import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SetupBrandHeader } from "../../src/components/auth/SetupBrandHeader";
import { SuccessCelebration } from "../../src/components/feedback/SuccessCelebration";
import { Button } from "../../src/components/ui/Button";

function parseCount(value: unknown): number {
  if (typeof value !== "string") {
    return 0;
  }
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

export default function ImportSuccessScreen() {
  const params = useLocalSearchParams<{
    count?: string;
    accountName?: string;
  }>();
  const count = parseCount(params.count);
  const accountName =
    typeof params.accountName === "string" && params.accountName.length > 0
      ? params.accountName
      : "your account";
  const countLabel = count.toLocaleString("en-ZA");

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6">
        <SetupBrandHeader />
        <SuccessCelebration
          subtitle={`${countLabel} transaction${count === 1 ? "" : "s"} imported for ${accountName}.`}
          title="Transactions added"
        />
        <View className="pb-4">
          <Button onPress={() => router.replace("/(tabs)")}>
            Continue to TracePay
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
