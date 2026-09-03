import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { COLORS, TRACEPAY, withAlpha } from "../../theme/colors";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  accentColor?: string;
  onBack?: () => void;
};

export function LeakFlowShell({
  title,
  subtitle,
  children,
  footer,
  accentColor,
  onBack,
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 px-5 pt-1">
        <IconButton
          accessibilityLabel="Go back"
          className="mb-4"
          variant="muted"
          onPress={onBack ?? (() => router.back())}
        >
          <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
        </IconButton>

        <Text className="text-[28px] font-bold tracking-[-0.5px] text-foreground">
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}

        <View className="flex-1">{children}</View>
      </View>

      {footer ? (
        <View
          className="px-5 py-4"
          style={{ backgroundColor: accentColor ?? palette.surfaceSoft }}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

type PrimaryFooterProps = {
  title: string;
  subtitle: string;
  buttonLabel: string;
  onPress: () => void;
  accentColor: string;
  variant?: "primary" | "accent";
};

export function LeakPrimaryFooter({
  title,
  subtitle,
  buttonLabel,
  onPress,
  accentColor,
  variant = "primary",
}: PrimaryFooterProps) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  if (variant === "accent") {
    return (
      <Pressable onPress={onPress} className="overflow-hidden rounded-full active:opacity-90">
        <LinearGradient
          colors={[trace.splashAccentPink, trace.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 20, paddingVertical: 16, borderRadius: 999 }}
        >
          <Text style={{ color: trace.primaryForeground }} className="text-[15px] font-bold">
            {title}
          </Text>
          <Text
            style={{ color: withAlpha(trace.primaryForeground, 0.9) }}
            className="mt-0.5 text-[12px]"
          >
            {subtitle}
          </Text>
          <View
            className="mt-3 self-start rounded-full px-4 py-2"
            style={{ backgroundColor: withAlpha(trace.primaryForeground, 0.2) }}
          >
            <Text style={{ color: trace.primaryForeground }} className="text-[13px] font-semibold">
              {buttonLabel}
            </Text>
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-foreground">{title}</Text>
        <Text className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</Text>
      </View>
      <Button
        onPress={onPress}
        size="sm"
        style={{ backgroundColor: accentColor }}
      >
        {buttonLabel}
      </Button>
    </View>
  );
}

export function resolveMarkColor(
  palette: (typeof COLORS)["light"] | (typeof COLORS)["dark"],
  key: string,
) {
  if (key === "destructive") return palette.destructive;
  if (key === "primary") return palette.primary;
  if (key === "success") return palette.success;
  if (key === "warning") return palette.warning;
  return palette.blue;
}
