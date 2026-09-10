import { router } from "expo-router";
import { Lock, Shield, UserRound } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SetupBrandHeader } from "../../src/components/auth/SetupBrandHeader";
import { Button } from "../../src/components/ui/Button";
import { COLORS } from "../../src/theme/colors";

const POINTS = [
  {
    Icon: Lock,
    title: "You control what you share",
    body: "You choose which bank statements to upload.",
  },
  {
    Icon: Shield,
    title: "Your data is safe",
    body: "We never make transactions or move your money.",
  },
  {
    Icon: UserRound,
    title: "You can remove your data any time",
    body: null,
  },
] as const;

export default function FinancialDataConsentScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6">
        <SetupBrandHeader />

        <Text className="mt-10 text-center text-[30px] font-bold tracking-[-0.7px] text-foreground">
          Let's get started
        </Text>
        <Text className="mt-3 text-center text-[15px] leading-[22px] text-muted-foreground">
          To analyse your spending and find money leaks, TracePay needs your
          transaction data.
        </Text>

        <View className="mt-10 gap-6">
          {POINTS.map(({ Icon, title, body }) => (
            <View key={title} className="flex-row items-start gap-4">
              <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <Icon color={palette.primary} size={20} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[16px] font-semibold text-foreground">
                  {title}
                </Text>
                {body ? (
                  <Text className="mt-1 text-[14px] leading-[20px] text-muted-foreground">
                    {body}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <View className="mt-auto pb-4">
          <Button
            onPress={() => router.replace("/(auth)/financial-accounts-setup")}
          >
            Continue
          </Button>
          <Text className="mt-4 px-2 text-center text-[12px] leading-[18px] text-muted-foreground">
            By continuing, you agree to our Terms and that we can process your
            financial data to provide insights.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
