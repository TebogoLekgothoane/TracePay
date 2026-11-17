import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Bell, ChevronRight, Download, Info } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";


import { LeakCategoryCard } from "../../src/components/leaks/LeakCategoryCards";
import { LockedLeakRow } from "../../src/components/leaks/LockedLeakRow";
import { PotentialLeakCard } from "../../src/components/leaks/PotentialLeakCard";
import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { InfoSheet } from "../../src/components/ui/Modal";
import { Skeleton } from "../../src/components/ui/Skeleton";
import {
  SkeletonLeakCards,
  SkeletonLeakSummary,
  SkeletonTile,
} from "../../src/components/ui/SkeletonGroups";
import { formatWholeRand } from "../../src/features/billing/billing.format";
import { useBilling } from "../../src/features/billing/billing.store";
import { useLeakEntitlement } from "../../src/features/leaks/leak-entitlement.store";
import { buildLiveLeakCategories } from "../../src/features/leaks/leak-categories.live";
import {
  splitLeaksForPaywall,
  totalMonthlyLeaks,
} from "../../src/features/leaks/leak-paywall";
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABEL,
  type ReviewStatus,
} from "../../src/features/leaks/potential-leaks";
import { liveLeaksMonthlyTotal, listLivePotentialLeaks } from "../../src/features/leaks/potential-leaks.live";
import { useDetectedSubscriptions } from "../../src/hooks/useDetectedSubscriptions";
import { useLeakFindings } from "../../src/hooks/useLeakFindings";
import { formatRandAmount } from "../../src/utils/currency";
import { COLORS, TRACEPAY, withAlpha } from "../../src/theme/colors";

export default function LeaksScreen() {
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");
  const [showDownloadInfo, setShowDownloadInfo] = useState(false);
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const detections = useLeakFindings(true);
  const { subscriptions } = useDetectedSubscriptions();
  const categories = useMemo(
    () => buildLiveLeakCategories(detections.result, subscriptions),
    [detections.result, subscriptions],
  );
  const leaks = useMemo(() => listLivePotentialLeaks(detections.result), [detections.result]);
  const findingsTotal = useMemo(() => {
    if (detections.result) {
      return formatRandAmount(liveLeaksMonthlyTotal(detections.result));
    }
    return totalMonthlyLeaks(leaks);
  }, [detections.result, leaks]);
  const paywall = useMemo(() => splitLeaksForPaywall(leaks), [leaks]);
  const { unlocked, hydrated } = useLeakEntitlement();
  const { products, entitlements, refresh } = useBilling();
  const price = products?.fullAnalysis.priceCents;
  const unlockLabel = price ? `Unlock full analysis · ${formatWholeRand(price)}` : "Unlock full analysis";
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const visible = useMemo(
    () => (filter === "all" ? leaks : leaks.filter((leak) => leak.status === filter)),
    [filter, leaks],
  );
  const openLeak = useCallback((id: string) => {
    router.push(`/leak/${id}`);
  }, []);
  const openUnlock = useCallback(() => {
    router.push("/leaks/unlocked" as never);
  }, []);
  const openCategory = useCallback((item: { id: string }) => {
    router.push(`/leak/${item.id}` as never);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-2">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
                Leaks
              </Text>
              <Text className="mt-0.5 text-[14px] leading-5 text-muted-foreground">
                Where your money is quietly slipping away.
              </Text>
            </View>

            <IconButton
              accessibilityLabel="Download report"
              variant="outline"
              onPress={() => setShowDownloadInfo(true)}
            >
              <Download color={palette.foreground} size={20} strokeWidth={2} />
            </IconButton>
          </View>

          {hydrated ? (
            <View className="mt-5 overflow-hidden rounded-[28px]">
              <LinearGradient
                pointerEvents="none"
                colors={[...TRACEPAY.light.summaryGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View className="px-5 py-5">
                <Text className="text-[13px] font-medium" style={{ color: TRACEPAY.light.heroMuted }}>
                  Estimated monthly leaks
                </Text>
                <Text className="mt-1 text-[36px] font-bold tracking-[-1px] text-white">
                  {findingsTotal}
                </Text>
                <View className="mt-4 flex-row gap-2">
                  <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: TRACEPAY.light.heroSubtle }}>
                    <Text className="text-[12px] font-semibold text-white">
                      {leaks.length} {leaks.length === 1 ? "finding" : "findings"}
                    </Text>
                  </View>
                  <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: TRACEPAY.light.heroSubtle }}>
                    <Text className="text-[12px] font-semibold text-white">
                      {categories.length} areas
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {!hydrated || (detections.loading && !detections.result) ? (
            <View>
              <View className="mt-5">
                <SkeletonLeakSummary />
              </View>

              <View className="mb-1 mt-8">
                <Skeleton width="42%" height={22} />
              </View>
              <Skeleton width="68%" height={14} />
              <ScrollView
                horizontal
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                className="-mx-5 mt-4"
                contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
              >
                {[0, 1, 2, 3].map((index) => (
                  <SkeletonTile key={index} />
                ))}
              </ScrollView>

              <View className="mb-1 mt-8">
                <Skeleton width="48%" height={22} />
              </View>
              <Skeleton width="72%" height={14} />
              <View className="mt-4">
                <SkeletonLeakCards count={5} />
              </View>
            </View>
          ) : (
            <>
              {detections.error && !detections.result ? (
                <View className="mt-5 rounded-3xl bg-card px-4 py-5">
                  <Text className="text-[15px] font-semibold text-foreground">Leaks unavailable</Text>
                  <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                    {detections.error}
                  </Text>
                  <Button className="mt-4" variant="secondary" onPress={detections.refresh}>
                    Try again
                  </Button>
                </View>
              ) : null}
              <Text className="mb-1 mt-8 text-[22px] font-bold tracking-[-0.3px] text-foreground">
                Leak breakdown
              </Text>
              <Text className="text-[14px] leading-5 text-muted-foreground">
                Areas where we found potential money leaks from your statements.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="-mx-5 mt-4"
                contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
              >
                {categories.map((item) => (
                  <LeakCategoryCard key={item.id} item={item} onPress={openCategory} />
                ))}
              </ScrollView>
            </>
          )}

          {!hydrated || (detections.loading && !detections.result) ? null : unlocked ? (
            <>
              <Text className="mb-1 mt-8 text-[22px] font-bold tracking-[-0.3px] text-foreground">
                Potential leaks
              </Text>
              <Text className="text-[14px] leading-5 text-muted-foreground">
                We found {leaks.length} things worth reviewing.
              </Text>

              <View className="mt-4 flex-row flex-wrap gap-2">
                {REVIEW_STATUSES.map((status) => {
                  const selected = status === filter;
                  const count = leaks.filter((leak) => leak.status === status).length;
                  return (
                    <Pressable
                      key={status}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setFilter((current) => (current === status ? "all" : status))}
                      className="overflow-hidden rounded-full px-4 py-2.5 active:opacity-80"
                      style={{ backgroundColor: selected ? undefined : palette.card }}
                    >
                      {selected ? (
                        <LinearGradient
                          pointerEvents="none"
                          colors={[...TRACEPAY.light.summaryGradient]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                      ) : null}
                      <Text
                        className="text-[13px] font-semibold"
                        style={{ color: selected ? "#FFFFFF" : palette.foreground }}
                      >
                        {REVIEW_STATUS_LABEL[status]} ({count})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View className="mt-4 gap-3">
                {visible.length === 0 ? (
                  <View className="rounded-3xl bg-card px-4 py-6">
                    <Text className="text-[15px] font-semibold text-foreground">
                      Nothing in {REVIEW_STATUS_LABEL[filter === "all" ? "new" : filter].toLowerCase()}
                    </Text>
                    <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                      Switch filters to see the other findings.
                    </Text>
                  </View>
                ) : (
                  visible.map((leak) => (
                    <PotentialLeakCard key={leak.id} leak={leak} onPress={openLeak} />
                  ))
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                className="mt-6 flex-row items-center gap-3 rounded-[20px] bg-card px-4 py-4 active:opacity-80"
                onPress={() =>
                  router.push((entitlements?.monitoring.active ? "/monitoring" : "/upgrade") as never)
                }
              >
                <View
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: withAlpha(palette.primary, 0.12) }}
                >
                  <Bell color={palette.primary} size={20} strokeWidth={2} />
                </View>
                <View className="min-w-0 flex-1">
                <Text className="text-[16px] font-bold text-foreground">
  {entitlements?.monitoring.active
    ? "Monitoring is on"
    : "Monitoring is off"}
</Text>

<Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
  {entitlements?.monitoring.active
    ? "See your plan, renewal date and recent alerts."
    : "Subscribe to monitoring to receive ongoing alerts."}
</Text>
                </View>
                <ChevronRight color={palette.mutedForeground} size={20} />
              </Pressable>
            </>
          ) : (
            <>
              <Text className="mb-1 mt-8 text-[22px] font-bold tracking-[-0.3px] text-foreground">
                Biggest findings
              </Text>
              <Text className="text-[14px] leading-5 text-muted-foreground">
                {leaks.length} potential {leaks.length === 1 ? "finding" : "findings"} ·{" "}
                {findingsTotal} estimated monthly impact
              </Text>

              <View className="mt-4 gap-2">
                {paywall.preview.map((leak) => (
                  <PotentialLeakCard key={leak.id} leak={leak} onPress={openLeak} />
                ))}
                {paywall.locked.map((leak) => (
                  <LockedLeakRow key={leak.id} leak={leak} onPress={openUnlock} />
                ))}
              </View>

              {paywall.locked.length > 0 || paywall.hiddenCount > 0 ? (
                <View className="mt-4">
                  {paywall.hiddenCount > 0 ? (
                    <Text className="mb-3 text-center text-[14px] leading-5 text-muted-foreground">
                      {paywall.hiddenCount} more {paywall.hiddenCount === 1 ? "finding is" : "findings are"} included in the full analysis.
                    </Text>
                  ) : null}
                  <Button onPress={openUnlock} arrow style={{ minHeight: 56 }}>
                    {unlockLabel}
                  </Button>
                </View>
              ) : null}
            </>
          )}
        </View>
      </TabScrollView>

      <InfoSheet
        visible={showDownloadInfo}
        title="Leaks report"
        message="PDF export is coming soon. Open a finding below to review what we found."
        onClose={() => setShowDownloadInfo(false)}
      />
    </SafeAreaView>
  );
}
