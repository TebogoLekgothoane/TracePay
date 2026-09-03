import { router } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";

export default function ScanningScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-[22px] font-bold text-foreground">
          Scanning
        </Text>
        <Text className="mt-2 text-center text-[14px] text-muted-foreground">
          Transaction scan will start here.
        </Text>
        <Button className="mt-6" size="md" onPress={() => router.back()}>
          Go back
        </Button>
      </View>
    </SafeAreaView>
  );
}
