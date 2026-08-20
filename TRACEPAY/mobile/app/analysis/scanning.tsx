import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
        <Pressable
          onPress={() => router.back()}
          className="mt-6 rounded-2xl bg-primary px-6 py-3 active:opacity-80"
        >
          <Text className="text-[14px] font-semibold text-primary-foreground">
            Go back
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
