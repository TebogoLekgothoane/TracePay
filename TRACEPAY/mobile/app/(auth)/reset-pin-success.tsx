import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../../src/theme/colors";

export default function ResetPinSuccessScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-7 pb-5">
        <View className="h-[94px] w-[94px] items-center justify-center">
          <Ionicons color={palette.primary} name="checkmark-circle" size={72} />
        </View>

        <Text className="mt-7 text-center text-[28px] font-bold tracking-[-0.6px] text-foreground">
          PIN reset complete
        </Text>
        <Text className="mt-2.5 text-center text-[15px] text-muted-foreground">
          Your new TracePay PIN is ready to use.
        </Text>

        <Pressable
          onPress={() => router.replace("/(auth)/unlock")}
          className="absolute bottom-5 left-7 right-7 min-h-[56px] items-center justify-center rounded-[18px] bg-primary active:opacity-70"
        >
          <Text className="text-[16px] font-bold text-primary-foreground">
            Return to unlock
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
