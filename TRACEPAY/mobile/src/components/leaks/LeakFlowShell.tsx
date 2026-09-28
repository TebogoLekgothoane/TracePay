import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../../theme/colors";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

type ShellProps = {
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
}: ShellProps) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="flex-1 px-5 pt-1">
        <IconButton
          accessibilityLabel="Go back"
          className="mb-3 self-start"
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
  /** @deprecated Kept for call-site compatibility; primary buttons use theme purple. */
  accentColor?: string;
  /** @deprecated Accent gradient CTAs removed; always renders primary Button. */
  variant?: "primary" | "accent";
};

export function LeakPrimaryFooter({
  title,
  subtitle,
  buttonLabel,
  onPress,
}: PrimaryFooterProps) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-foreground">{title}</Text>
        <Text className="mt-0.5 text-[12px] text-muted-foreground">
          {subtitle}
        </Text>
      </View>
      <Button onPress={onPress} size="sm">
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
