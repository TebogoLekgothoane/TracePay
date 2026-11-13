import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { COLORS } from "../../theme/colors";
import { IconButton } from "./IconButton";

export function goBackOr(fallback: string) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as never);
  }
}

type Props = {
  title: string;
  subtitle?: string;
  /** Defaults to going back, or to the home tab when there is nothing to go back to. */
  onBack?: () => void;
  backLabel?: string;
  /** Sits at the far end of the same row, for example a help button. */
  right?: ReactNode;
  className?: string;
};

/**
 * The top of every screen: the back arrow and the title on one row, the arrow first. There is
 * deliberately no icon or logo next to the title.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Go back",
  right,
  className = "",
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className={`flex-row items-center gap-3 ${className}`}>
      <IconButton
        accessibilityLabel={backLabel}
        variant="muted"
        onPress={onBack ?? (() => goBackOr("/(tabs)"))}
      >
        <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
      </IconButton>
      <View className="min-w-0 flex-1">
        <Text
          accessibilityRole="header"
          className="text-[24px] font-bold tracking-[-0.4px] text-foreground"
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
