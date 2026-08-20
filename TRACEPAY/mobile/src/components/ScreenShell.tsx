import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../theme/colors";

type ScreenShellProps = {
  title: string;
  highlight?: string;
  description?: string;
  actionLabel?: string;
  next?: string;
  secondaryLabel?: string;
  secondaryNext?: string;
};

export function ScreenShell({
  title,
  highlight,
  description,
  actionLabel = "Continue",
  next,
  secondaryLabel,
  secondaryNext,
}: ScreenShellProps) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const navigate = (path?: string) =>
    path ? router.push(path as never) : router.back();

  return (
    <SafeAreaView className="flex-1 bg-background px-[18px]">
      <View className="flex-1">
        <TouchableOpacity
          className="h-[36px] w-[36px] items-center justify-center"
          onPress={() => navigate()}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={palette.mutedForeground}
          />
        </TouchableOpacity>
        <View className="flex-1 items-center justify-center">
          <View className="mb-[28px] h-[88px] w-[88px] items-center justify-center">
            <Ionicons
              name="shield-checkmark-outline"
              size={42}
              color={palette.primary}
            />
          </View>
          <Text className="text-center text-[26px] font-bold leading-[32px] text-foreground">
            {title}
          </Text>
          {highlight ? (
            <Text className="mt-[2px] text-center text-[26px] font-bold leading-[32px] text-primary">
              {highlight}
            </Text>
          ) : null}
          {description ? (
            <Text className="mt-[12px] max-w-[320px] text-center text-[13px] leading-[20px] text-muted-foreground">
              {description}
            </Text>
          ) : null}
        </View>
        <View className="gap-[10px] pb-[12px]">
          {next ? (
            <TouchableOpacity
              className="h-[50px] items-center justify-center rounded-full bg-primary"
              activeOpacity={0.85}
              onPress={() => navigate(next)}
            >
              <Text className="text-[14px] font-bold text-primary-foreground">
                {actionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
          {secondaryLabel && secondaryNext ? (
            <TouchableOpacity
              className="h-[48px] items-center justify-center rounded-full border border-border bg-card"
              onPress={() => navigate(secondaryNext)}
            >
              <Text className="text-[14px] font-semibold text-primary">
                {secondaryLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
