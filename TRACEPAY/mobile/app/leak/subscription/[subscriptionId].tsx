import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  PauseCircle,
  SlidersHorizontal,
  XCircle,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveMarkColor } from "../../../src/components/leaks/LeakFlowShell";
import { BrandLogo } from "../../../src/components/ui/BrandLogo";
import { IconButton } from "../../../src/components/ui/IconButton";
import { SimpleBrandLogo } from "../../../src/components/ui/SimpleBrandLogo";
import {
  getSubscriptionById,
  listUpcomingSubscriptions,
  type UpcomingSubscription,
} from "../../../src/features/leaks/subscriptions.catalog";
import { COLORS, TRACEPAY, withAlpha } from "../../../src/theme/colors";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May"];
const TABS = ["Details", "Upcoming"] as const;
type SubscriptionTab = (typeof TABS)[number];

function daysUntilLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export default function SubscriptionDetailScreen() {
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const [tab, setTab] = useState<SubscriptionTab>("Details");
  const sub = getSubscriptionById(subscriptionId);
  const upcoming = useMemo(() => listUpcomingSubscriptions(), []);

  useEffect(() => {
    setTab("Details");
  }, [subscriptionId]);
  const accent = palette.destructive;
  const maxSpend = Math.max(...sub.history, 1);
  const statusColor = sub.status === "Active" ? palette.success : palette.blue;

  const cancelActionId = `cancel-${subscriptionId ?? "netflix"}`;
  const actions = [
    {
      id: "cancel",
      title: "Cancel subscription",
      Icon: XCircle,
      route: `/leak/subs/fix/${cancelActionId}/guide`,
    },
    {
      id: "snooze",
      title: "Snooze for 1 month",
      Icon: PauseCircle,
      route: `/leak/subs/fix/${cancelActionId}`,
    },
    {
      id: "limit",
      title: "Set spending limit",
      Icon: SlidersHorizontal,
      route: "/leak/subs/fix/limits/guide",
    },
    {
      id: "remind",
      title: "Remind me to review",
      Icon: Bell,
      route: "/leak/subs/fix/alerts/guide",
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <IconButton
            accessibilityLabel="Go back"
            className="mb-4"
            variant="outline"
            onPress={() => router.back()}
          >
            <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
          </IconButton>

          <Text className="text-[28px] font-bold text-foreground">
            Subscription detail
          </Text>

          <View className="mt-5 flex-row items-center gap-3">
            {sub.logoDomain ? (
              <BrandLogo
                name={sub.name}
                logoDomain={sub.logoDomain}
                size={56}
                fallbackColor={resolveMarkColor(palette, sub.markColor)}
                shape="squircle"
              />
            ) : sub.brandId ? (
              <SimpleBrandLogo
                name={sub.name}
                brandId={sub.brandId}
                size={56}
                fallbackColor={resolveMarkColor(palette, sub.markColor)}
                shape="squircle"
              />
            ) : (
              <View className="h-14 w-14 items-center justify-center">
                <Text
                  className="text-[20px] font-bold"
                  style={{ color: resolveMarkColor(palette, sub.markColor) }}
                >
                  {sub.mark}
                </Text>
              </View>
            )}
            <View className="flex-1">
              <Text className="text-[20px] font-bold text-foreground">{sub.name}</Text>
              <Text className="mt-0.5 text-[13px] text-muted-foreground">
                {sub.category} · {sub.billing}
              </Text>
            </View>
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: withAlpha(statusColor, 0.14) }}
            >
              <Text className="text-[11px] font-semibold" style={{ color: statusColor }}>
                {sub.status}
              </Text>
            </View>
          </View>

          <View className="mt-5 flex-row rounded-2xl bg-muted p-1.5">
            {TABS.map((item) => {
              const selected = item === tab;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  className="flex-1 items-center rounded-full py-2.5 active:opacity-80"
                  style={selected ? { backgroundColor: accent } : undefined}
                  onPress={() => setTab(item)}
                >
                  <Text
                    className={`text-[13px] ${selected ? "font-semibold" : "font-medium text-muted-foreground"}`}
                    style={selected ? { color: trace.primaryForeground } : undefined}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tab === "Details" ? (
            <>
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
                    onPress={() => router.push(item.route as Href)}
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
                    <ChevronRight
                      color={palette.placeholder}
                      size={16}
                      strokeWidth={2}
                    />
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <UpcomingTab
              items={upcoming}
              currentId={sub.id}
              accent={accent}
              muted={palette.mutedForeground}
              placeholder={palette.placeholder}
            />
          )}
        </View>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cancel ${sub.name} with step-by-step guide`}
        onPress={() => router.push(`/leak/subs/fix/${cancelActionId}/guide`)}
        className="absolute bottom-0 left-0 right-0 px-5 pt-4 active:opacity-90"
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
          Step-by-step guide · about 5 minutes
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

function UpcomingTab({
  items,
  currentId,
  accent,
  muted,
  placeholder,
}: {
  items: UpcomingSubscription[];
  currentId: string;
  accent: string;
  muted: string;
  placeholder: string;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  if (items.length === 0) {
    return (
      <View className="mt-5 rounded-3xl border border-border bg-card px-4 py-6">
        <Text className="text-center text-[15px] font-semibold text-foreground">
          No upcoming charges
        </Text>
        <Text className="mt-1 text-center text-[13px] leading-5 text-muted-foreground">
          Active subscriptions with a next billing date will show up here.
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-5">
      <Text className="mb-1 text-[17px] font-bold text-foreground">Upcoming charges</Text>
      <Text className="mb-3 text-[13px] leading-5 text-muted-foreground">
        Active subscriptions sorted by next billing date.
      </Text>
      <View className="gap-2">
        {items.map((item) => {
          const markColor = resolveMarkColor(palette, item.markColor);
          const isCurrent = item.id === currentId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${daysUntilLabel(item.daysUntil)}`}
              className={`flex-row items-center gap-3 rounded-[20px] border px-4 py-3.5 active:opacity-80 ${
                isCurrent ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
              }`}
              onPress={() => {
                if (isCurrent) return;
                router.push(`/leak/subscription/${item.id}` as never);
              }}
            >
              {item.logoDomain ? (
                <BrandLogo
                  name={item.name}
                  logoDomain={item.logoDomain}
                  size={40}
                  fallbackColor={markColor}
                  shape="squircle"
                />
              ) : item.brandId ? (
                <SimpleBrandLogo
                  name={item.name}
                  brandId={item.brandId}
                  size={40}
                  fallbackColor={markColor}
                  shape="squircle"
                />
              ) : (
                <View className="h-10 w-10 items-center justify-center rounded-[12px] bg-muted">
                  <Text className="text-[14px] font-bold" style={{ color: markColor }}>
                    {item.mark}
                  </Text>
                </View>
              )}
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
                  {item.name}
                  {isCurrent ? " · Viewing" : ""}
                </Text>
                <Text className="mt-0.5 text-[12px]" style={{ color: muted }}>
                  {item.nextChargeLabel} · {daysUntilLabel(item.daysUntil)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[14px] font-bold text-foreground">{item.amount}</Text>
                <Text
                  className="mt-0.5 text-[11px] font-semibold"
                  style={{ color: accent }}
                >
                  Upcoming
                </Text>
              </View>
              {!isCurrent ? (
                <ChevronRight color={placeholder} size={16} strokeWidth={2} />
              ) : (
                <View className="w-4" />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
