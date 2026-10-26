import { router } from "expo-router";
import { Check, ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../../theme/colors";
import { IconButton } from "../ui/IconButton";

export function goBackOr(fallback: string) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as never);
  }
}

type ShellProps = {
  children: ReactNode;
  /** Fixed to the bottom, so primary actions stay reachable. */
  footer?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
};

/** Flat page frame for the paywall, checkout and monitoring screens. */
export function BillingShell({ children, footer, onBack, backLabel = "Go back" }: ShellProps) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="px-5 pt-1">
        {onBack ? (
          <IconButton accessibilityLabel={backLabel} className="self-start" variant="muted" onPress={onBack}>
            <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
          </IconButton>
        ) : (
          <View className="h-10" />
        )}
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View className="border-t border-border/60 bg-background px-5 pb-2 pt-3">{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

export function Checklist({ items }: { items: string[] }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  return (
    <View className="gap-3">
      {items.map((item) => (
        <View key={item} className="flex-row items-start gap-3">
          <View className="mt-0.5">
            <Check color={palette.primary} size={18} strokeWidth={2.6} />
          </View>
          <Text className="min-w-0 flex-1 text-[15px] leading-[22px] text-foreground">{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <View className={`rounded-2xl bg-card px-4 py-4 ${className}`}>
      {children}
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View className="rounded-2xl bg-destructive/10 px-4 py-3">
      <Text className="text-[14px] leading-5 text-destructive">{message}</Text>
    </View>
  );
}
