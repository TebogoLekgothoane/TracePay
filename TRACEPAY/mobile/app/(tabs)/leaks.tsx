import { router, useFocusEffect } from "expo-router";
import { Download } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";


import { LeakCategoryCard } from "../../src/components/leaks/LeakCategoryCards";
import { LockedLeakRow } from "../../src/components/leaks/LockedLeakRow";
import { PotentialLeakCard } from "../../src/components/leaks/PotentialLeakCard";
import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { InfoSheet } from "../../src/components/ui/Modal";
import { Skeleton } from "../../src/components/ui/Skeleton";
import { SkeletonRows, SkeletonTile } from "../../src/components/ui/SkeletonGroups";
import { formatWholeRand } from "../../src/features/billing/billing.format";
import { useBilling } from "../../src/features/billing/billing.store";
import { useLeakEntitlement } from "../../src/features/leaks/leak-entitlement.store";
import { LEAK_CATEGORIES } from "../../src/features/leaks/leak-categories";
import {
  splitLeaksForPaywall,
  totalMonthlyLeaks,
} from "../../src/features/leaks/leak-paywall";
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABEL,
  listPotentialLeaks,
  type ReviewStatus,
} from "../../src/features/leaks/potential-leaks";
import { COLORS } from "../../src/theme/colors";

export default function LeaksScreen() {
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");
  const [showDownloadInfo, setShowDownloadInfo] = useState(false);
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const leaks = useMemo(() => listPotentialLeaks(), []);
  const findingsTotal = useMemo(() => totalMonthlyLeaks(leaks), [leaks]);
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
  const openUpgrade = useCallback(() => {
    router.push("/upgrade");
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
        <View className="px-5 pt-">
          <View className="mb-1 flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
                Leaks
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



          {!hydrated ? (
            <View className="mt-7">
              <View className="gap-2.5">
                <Skeleton width="45%" height={22} />
                <Skeleton width="70%" height={14} />
              </View>
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

              <View className="mt-7 gap-2.5">
                <Skeleton width="50%" height={22} />
                <Skeleton width="85%" height={14} />
              </View>
              <View className="mt-4">
                <SkeletonRows count={5} compact />
              </View>
            </View>
          ) : (
            <>
              <Text className="mb-1 mt-7 text-[22px] font-bold tracking-[-0.3px] text-foreground">
                Leak breakdown
              </Text>
              <Text className="text-[14px] leading-5 text-muted-foreground">
                Areas where we found potential money leaks.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="-mx-5 mt-4"
                contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
              >
                {LEAK_CATEGORIES.map((item) => (
                  <LeakCategoryCard key={item.id} item={item} onPress={openCategory} />
                ))}
              </ScrollView>
            </>
          )}

          {!hydrated ? null : unlocked ? (
            <>
              <Text className="mb-1 mt-7 text-[22px] font-bold tracking-[-0.3px] text-foreground">
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
                      className="rounded-full px-4 py-2.5 active:opacity-80"
                      style={{
                        backgroundColor: selected ? palette.primary : palette.card,
                      }}
                    >
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
                className="mt-6 rounded-3xl bg-card px-4 py-4 active:opacity-80"
                onPress={() =>
                  router.push((entitlements?.monitoring.active ? "/monitoring" : "/upgrade") as never)
                }
              >
                <Text className="text-[16px] font-bold text-foreground">
                  {entitlements?.monitoring.active
                    ? "Monitoring is on"
                    : "Keep TracePay working for you"}
                </Text>
                <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  {entitlements?.monitoring.active
                    ? "See your plan, renewal date and recent alerts."
                    : "Get alerted to new potential leaks as your activity changes. Optional."}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="mb-1 mt-7 text-[22px] font-bold tracking-[-0.3px] text-foreground">
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
                  <LockedLeakRow key={leak.id} leak={leak} onPress={openUpgrade} />
                ))}
              </View>

              {paywall.locked.length > 0 ? (
                <>
                  <Text className="mt-5 text-center text-[13px] leading-5 text-muted-foreground">
                    Unlock your complete analysis to see all {leaks.length} findings, evidence and
                    next steps.
                  </Text>

                  <View className="mt-3">
                    <Button onPress={openUpgrade} arrow style={{ minHeight: 44 }}>
                      {unlockLabel}
                    </Button>
                    <Text className="mt-1.5 text-center text-[11px] text-muted-foreground">
                      One payment. Not a subscription.
                    </Text>
                  </View>
                </>
              ) : null}
            </>
          )}
        </View>
      </TabScrollView>

      <InfoSheet
        visible={showDownloadInfo}
        title="Leaks report"
        message="PDF export is coming soon. Open a finding below to review what we know and record what you've done."
        onClose={() => setShowDownloadInfo(false)}
      />
    </SafeAreaView>
  );
}
