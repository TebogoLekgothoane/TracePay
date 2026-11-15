import { router, useLocalSearchParams, type Href } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  PauseCircle,
  Sparkles,
  SlidersHorizontal,
  XCircle,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveMarkColor } from "../../../src/components/leaks/LeakFlowShell";
import { BrandLogo } from "../../../src/components/ui/BrandLogo";
import { ScreenHeader } from "../../../src/components/ui/ScreenHeader";
import {
  buildRecurringDetail,
  findDetectedById,
} from "../../../src/features/leaks/recurring-detail";
import { resolveLogoDomainFromMerchantLabel } from "../../../src/features/transactions/merchant-logos";
import { KeepPaymentCard } from "../../../src/components/leaks/KeepPaymentCard";
import { normaliseMerchantKey } from "../../../src/features/leaks/kept-payments";
import { useKeptPayments } from "../../../src/features/leaks/kept-payments.preferences";
import { useDetectedSubscriptions } from "../../../src/hooks/useDetectedSubscriptions";
import { COLORS, TRACEPAY, withAlpha } from "../../../src/theme/colors";

export default function SubscriptionDetailScreen() {
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const detected = useDetectedSubscriptions();
  const { kept, keep, unkeep } = useKeptPayments();
  const found = useMemo(
    () => findDetectedById(detected.subscriptions, subscriptionId),
    [detected.subscriptions, subscriptionId],
  );
  const sub = useMemo(() => (found ? buildRecurringDetail(found) : null), [found]);
  const accent = palette.destructive;

  if (!sub) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5" edges={["top"]}>
        <ScreenHeader className="mb-4" title="Recurring Payment" />
        <Text className="mt-10 text-center text-[15px] text-muted-foreground">
          {detected.loading
            ? "Loading this payment…"
            : "We couldn't find this recurring payment in your statements."}
        </Text>
      </SafeAreaView>
    );
  }

  const logoDomain = resolveLogoDomainFromMerchantLabel(sub.name);
  const maxSpend = Math.max(...sub.history.map((row) => row.amount), 1);
  const statusColor = sub.active ? palette.success : palette.blue;

  const cancelActionId = sub.cancelActionId;
  const actions = [
    {
      id: "cancel",
      title: "Cancel recurring payment",
      Icon: XCircle,
      route: `/leak/subs/fix/${cancelActionId}/guide`,
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
          <ScreenHeader className="mb-4" title="Recurring Payment" />

          <LinearGradient
            colors={[...trace.summaryGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 28, padding: 18, overflow: "hidden" }}
          >
            <View className="flex-row items-start justify-between">
              {logoDomain ? (
                <BrandLogo
                  name={sub.name}
                  logoDomain={logoDomain}
                  size={52}
                  fallbackColor={resolveMarkColor(palette, "primary")}
                  shape="squircle"
                />
              ) : (
                <View className="h-[52px] w-[52px] items-center justify-center rounded-2xl bg-white/10">
                  <Text className="text-[20px] font-bold" style={{ color: trace.heroForeground }}>
                    {sub.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )}
              <View
                className="rounded-full px-2.5 py-1"
                style={{ backgroundColor: withAlpha(statusColor, 0.2) }}
              >
                <Text className="text-[11px] font-bold" style={{ color: trace.heroForeground }}>
                  {sub.statusLabel}
                </Text>
              </View>
            </View>
            <Text className="mt-5 text-[24px] font-bold" style={{ color: trace.heroForeground }}>
              {sub.name}
            </Text>
            <Text className="mt-1 text-[13px]" style={{ color: trace.heroMuted }}>
              {sub.category} · {sub.billing}
            </Text>
            <View className="mt-5 flex-row items-end justify-between">
              <View>
                <Text className="text-[12px]" style={{ color: trace.heroMuted }}>
                  Regular charge
                </Text>
                <Text className="mt-1 text-[30px] font-bold" style={{ color: trace.heroForeground }}>
                  {sub.amount}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[12px]" style={{ color: trace.heroMuted }}>
                  Next charge
                </Text>
                <Text className="mt-1 text-[14px] font-semibold" style={{ color: trace.heroForeground }}>
                  {sub.nextCharge}
                </Text>
              </View>
            </View>
          </LinearGradient>

          <>
              <KeepPaymentCard
                name={sub.name}
                kept={kept.has(normaliseMerchantKey(found?.merchantKey))}
                onToggle={() => {
                  const merchant = found?.merchantKey ?? sub.name;
                  void (kept.has(normaliseMerchantKey(merchant)) ? unkeep(merchant) : keep(merchant));
                }}
              />
              <View className="mt-5 rounded-3xl bg-card p-4">
                <View className="mb-3 flex-row items-center gap-2">
                  <View className="h-8 w-8 items-center justify-center rounded-xl bg-muted">
                    <CreditCard color={palette.primary} size={16} strokeWidth={2.2} />
                  </View>
                  <Text className="text-[16px] font-bold text-foreground">
                    Payment details
                  </Text>
                </View>
                <DetailRow label="Type" value={sub.kindLabel} />
                {sub.started ? <DetailRow label="First seen" value={sub.started} /> : null}
                {sub.lastCharged ? <DetailRow label="Last charged" value={sub.lastCharged} /> : null}
                <DetailRow label="Times charged" value={String(sub.seenCount)} />
                <DetailRow label="Category" value={sub.category} last />
              </View>

              <View className="mb-3 mt-7 flex-row items-end justify-between">
                <View>
                  <Text className="text-[17px] font-bold text-foreground">
                    Spending history
                  </Text>
                  <Text className="mt-1 text-[12px] text-muted-foreground">
                    Your last charges, from your statements
                  </Text>
                </View>
                <Text className="text-[12px] font-semibold text-primary">{sub.billing}</Text>
              </View>
              <View className="rounded-3xl bg-card p-4">
                <View className="h-40 flex-row items-end gap-2">
                  {sub.history.map((row, index) => {
                    const value = row.amount;
                    const height = value > 0 ? Math.max((value / maxSpend) * 92, 8) : 8;
                    const isCurrent = index === sub.history.length - 1;

                    return (
                      <View key={`${row.label}-${index}`} className="h-full flex-1 items-center justify-end">
                        <Text className="mb-2 text-[10px] font-semibold text-muted-foreground">
                          {value > 0 ? `R${value.toFixed(0)}` : "—"}
                        </Text>
                        <View
                          className="w-full justify-end overflow-hidden rounded-xl"
                          style={{
                            height: 104,
                            backgroundColor: withAlpha(palette.mutedForeground, 0.08),
                          }}
                        >
                          <View
                            className="w-full rounded-xl"
                            style={{
                              height,
                              backgroundColor: isCurrent ? accent : withAlpha(accent, 0.32),
                            }}
                          />
                        </View>
                        <Text className="mt-2 text-[11px] text-muted-foreground">
                          {row.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View className="mb-3 mt-7 flex-row items-center gap-2">
                <Sparkles color={palette.accent} size={18} strokeWidth={2.2} />
                <Text className="text-[17px] font-bold text-foreground">
                  Review options
                </Text>
              </View>
              <View className="overflow-hidden rounded-3xl bg-card">
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
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View className={`flex-row items-center justify-between py-3 ${last ? "" : "border-b border-border/60"}`}>
      <Text className="text-[13px] text-muted-foreground">{label}</Text>
      <Text className="max-w-[62%] text-right text-[13px] font-semibold text-foreground">
        {value}
      </Text>
    </View>
  );
}
