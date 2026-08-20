import { router, useLocalSearchParams } from "expo-router";
import {
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  PauseCircle,
  SlidersHorizontal,
  XCircle,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, TRACEPAY, type ColorScheme, withAlpha } from "../../../src/theme/colors";

const SUBSCRIPTIONS: Record<
  string,
  {
    name: string;
    mark: string;
    markColor: "destructive" | "primary" | "success" | "secondary";
    category: string;
    billing: string;
    amount: string;
    billingDate: string;
    paymentMethod: string;
    startDate: string;
    history: number[];
  }
> = {
  netflix: {
    name: "Netflix",
    mark: "N",
    markColor: "destructive",
    category: "Entertainment",
    billing: "Billed monthly",
    amount: "R159.00",
    billingDate: "15th of each month",
    paymentMethod: "Capitec ·••• 9101",
    startDate: "Jan 2024",
    history: [159, 159, 159, 159, 159],
  },
  showmax: {
    name: "Showmax",
    mark: "S",
    markColor: "primary",
    category: "Entertainment",
    billing: "Billed monthly",
    amount: "R99.00",
    billingDate: "1st of each month",
    paymentMethod: "Capitec ·••• 9101",
    startDate: "Mar 2024",
    history: [99, 99, 99, 99, 99],
  },
  spotify: {
    name: "Spotify Premium",
    mark: "♪",
    markColor: "success",
    category: "Music",
    billing: "Billed monthly",
    amount: "R69.00",
    billingDate: "8th of each month",
    paymentMethod: "MTN MoMo ·••• 5678",
    startDate: "Nov 2023",
    history: [69, 69, 69, 69, 69],
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May"];

function markColor(
  palette: (typeof COLORS)[ColorScheme],
  key: (typeof SUBSCRIPTIONS)["netflix"]["markColor"],
) {
  if (key === "destructive") return palette.destructive;
  if (key === "primary") return palette.primary;
  if (key === "success") return palette.success;
  return palette.blue;
}

export default function SubscriptionDetailScreen() {
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const sub = SUBSCRIPTIONS[subscriptionId ?? "netflix"] ?? SUBSCRIPTIONS.netflix;
  const accent = palette.destructive;
  const maxSpend = Math.max(...sub.history);

  const actions = [
    { id: "cancel", title: "Cancel subscription", Icon: XCircle },
    { id: "snooze", title: "Snooze for 1 month", Icon: PauseCircle },
    { id: "limit", title: "Set spending limit", Icon: SlidersHorizontal },
    { id: "remind", title: "Remind me to review", Icon: Bell },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <Pressable
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            className="mb-4 h-10 w-10 items-center justify-center rounded-xl border border-border bg-card active:opacity-75"
          >
            <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
          </Pressable>

          <Text className="text-[28px] font-bold text-foreground">
            Subscription detail
          </Text>

          <View className="mt-5 flex-row items-center gap-3">
            <View
              className="h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: withAlpha(markColor(palette, sub.markColor), 0.14),
              }}
            >
              <Text
                className="text-[20px] font-bold"
                style={{ color: markColor(palette, sub.markColor) }}
              >
                {sub.mark}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-[20px] font-bold text-foreground">{sub.name}</Text>
              <Text className="mt-0.5 text-[13px] text-muted-foreground">
                {sub.category} · {sub.billing}
              </Text>
            </View>
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: withAlpha(palette.success, 0.14) }}
            >
              <Text
                className="text-[11px] font-semibold"
                style={{ color: palette.success }}
              >
                Active
              </Text>
            </View>
          </View>

          <View className="mt-5 overflow-hidden rounded-3xl border border-border bg-card">
            {[
              ["Amount", sub.amount],
              ["Billing date", sub.billingDate],
              ["Payment method", sub.paymentMethod],
              ["Start date", sub.startDate],
            ].map(([label, value], index) => (
              <View
                key={label}
                className={`flex-row items-center justify-between px-4 py-3.5 ${
                  index < 3 ? "border-b border-border/60" : ""
                }`}
              >
                <Text className="text-[13px] text-muted-foreground">{label}</Text>
                <Text className="text-[14px] font-semibold text-foreground">
                  {value}
                </Text>
              </View>
            ))}
          </View>

          <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
            Spending history
          </Text>
          <View className="rounded-3xl border border-border bg-card p-4">
            <View className="flex-row items-end justify-between gap-2">
              {sub.history.map((value, index) => {
                const height = 24 + (value / maxSpend) * 72;
                const isCurrent = index === sub.history.length - 1;

                return (
                  <View key={MONTHS[index]} className="flex-1 items-center">
                    <View
                      className="w-full rounded-t-lg"
                      style={{
                        height,
                        backgroundColor: isCurrent
                          ? accent
                          : withAlpha(accent, 0.25),
                      }}
                    />
                    <Text className="mt-2 text-[11px] text-muted-foreground">
                      {MONTHS[index]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
            What can I do?
          </Text>
          <View className="overflow-hidden rounded-3xl border border-border bg-card">
            {actions.map((item, index) => (
              <Pressable
                key={item.id}
                className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-75 ${
                  index < actions.length - 1 ? "border-b border-border/60" : ""
                }`}
              >
                <View
                  className="h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: withAlpha(accent, 0.12) }}
                >
                  <item.Icon color={accent} size={18} strokeWidth={2.2} />
                </View>
                <Text className="flex-1 text-[14px] font-semibold text-foreground">
                  {item.title}
                </Text>
                <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <View
        className="absolute bottom-0 left-0 right-0 px-5 pt-4"
        style={{
          paddingBottom: Math.max(insets.bottom, 16),
          backgroundColor: accent,
        }}
      >
        <Text
          style={{ color: trace.primaryForeground }}
          className="text-center text-[15px] font-bold"
        >
          Cancel subscription
        </Text>
        <Text
          style={{ color: withAlpha(trace.primaryForeground, 0.85) }}
          className="mt-0.5 text-center text-[12px]"
        >
          It takes less than 1 minute
        </Text>
      </View>
    </SafeAreaView>
  );
}
