import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../theme/colors";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";

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
        <IconButton
          accessibilityLabel="Go back"
          variant="ghost"
          onPress={() => navigate()}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={palette.mutedForeground}
          />
        </IconButton>
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
            <Button onPress={() => navigate(next)}>{actionLabel}</Button>
          ) : null}
          {secondaryLabel && secondaryNext ? (
            <Button
              size="md"
              variant="secondary"
              onPress={() => navigate(secondaryNext)}
            >
              {secondaryLabel}
            </Button>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
