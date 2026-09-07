import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { COLORS } from "../../src/theme/colors";

export default function ResetPinSuccessScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <SafeAreaView className="flex-1 bg-background px-7">
      <View className="flex-1">
        <View className="flex-1 items-center justify-center">
          <View className="h-[94px] w-[94px] items-center justify-center">
            <Ionicons
              color={palette.primary}
              name="checkmark-circle"
              size={72}
            />
          </View>

          <Text className="mt-7 text-center text-[28px] font-bold tracking-[-0.6px] text-foreground">
            PIN reset complete
          </Text>
          <Text className="mt-2.5 max-w-[320px] text-center text-[15px] leading-[22px] text-muted-foreground">
            Your new TracePay PIN is ready to use.
          </Text>
        </View>

        <View className="pb-5">
          <Button onPress={() => router.replace("/(auth)/unlock")}>
            Return to unlock
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
