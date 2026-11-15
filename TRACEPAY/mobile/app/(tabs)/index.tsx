import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BalanceCard } from "../../src/components/dashboard/BalanceCard";
import { HomeHeader } from "../../src/components/dashboard/HomeHeader";
import { HomeInsights } from "../../src/components/dashboard/HomeInsights";
import { SpendingRhythmCard } from "../../src/components/dashboard/SpendingRhythmCard";
import { UpcomingPayments } from "../../src/components/dashboard/UpcomingPayments";
import { PotentialLeakCard } from "../../src/components/leaks/PotentialLeakCard";
import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import {
  ADD_ACCOUNT_HREF,
  LINKED_ACCOUNTS_HREF,
} from "../../src/features/accounts/account.navigation";
import type { RhythmSpan } from "../../src/features/dashboard/spending-rhythm";
import { buildSpendingPatterns } from "../../src/features/insights/spending-patterns";
import { countsAsLeak } from "../../src/features/leak-intelligence/leak-debug-categories";
import { useLeakEntitlement } from "../../src/features/leaks/leak-entitlement.store";
import { rankLeaksByMonthlyCost, splitLeaksForPaywall } from "../../src/features/leaks/leak-paywall";
import { listLivePotentialLeaks } from "../../src/features/leaks/potential-leaks.live";
import { formatRandAmount } from "../../src/utils/currency";
import {
  firstNameFromFullName,
  initialsFromName,
} from "../../src/features/auth/auth.validation";
import { usePrivacyPreferences } from "../../src/features/privacy/privacy.preferences";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useFindingNotifications } from "../../src/hooks/useFindingNotifications";
import { useLeakFindings } from "../../src/hooks/useLeakFindings";
import { useProfile } from "../../src/hooks/useProfile";
import { useSpendingPatternData } from "../../src/hooks/useSpendingPatternData";
import { useSpendingRhythm } from "../../src/hooks/useSpendingRhythm";
import { useUpcomingPayments } from "../../src/hooks/useUpcomingPayments";
import { COLORS } from "../../src/theme/colors";

export default function HomeScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { hideBalances, toggleHideBalances } = usePrivacyPreferences();
  const { profile } = useProfile();
  const { previews, loading: accountsLoading } = useAccounts();

  const [rhythmSpan, setRhythmSpan] = useState<RhythmSpan>("6 months");
  const rhythm = useSpendingRhythm(rhythmSpan);
  const upcoming = useUpcomingPayments();
  const leakDetections = useLeakFindings(previews.length > 0);
  const { unlocked } = useLeakEntitlement();
  const patternData = useSpendingPatternData();
  const { notifications } = useFindingNotifications();
  const hasUnreadNotifications = notifications.some(
    (notification) => notification.deliveryStatus !== "read",
  );
  const insights = useMemo(
    () =>
      patternData.data?.referenceDate
        ? buildSpendingPatterns(patternData.data.rows, patternData.data.referenceDate).insights
        : [],
    [patternData.data],
  );
  const upcomingPayments = upcoming.payments;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = profile ? firstNameFromFullName(profile.fullName) : "";

  const ranked = useMemo(
    () => rankLeaksByMonthlyCost(listLivePotentialLeaks(leakDetections.result)),
    [leakDetections.result],
  );
  // Same rule as the Leaks tab: with three or more findings the two biggest show, with one or
  // two findings only the biggest does. Once unlocked, the two biggest always show.
  const topFindings = useMemo(
    () => (unlocked ? ranked.slice(0, 2) : splitLeaksForPaywall(ranked).preview),
    [ranked, unlocked],
  );

  // Real detections from the user's statements. Findings that overlap another
  // finding (counted_in_total false) and closed ones stay out of the sum.
  const leakTotal = useMemo(() => {
    if (!leakDetections.result) {
      return null;
    }
    return leakDetections.result.leaks
      .filter(
        (leak) =>
          (leak.status === "active" || leak.status === "monitoring") &&
          leak.analysis?.counted_in_total !== false &&
          countsAsLeak(leak),
      )
      .reduce((sum, leak) => sum + Number(leak.estimated_monthly_impact), 0);
  }, [leakDetections.result]);

  const balanceLabel =
    previews.length === 0
      ? "Add accounts"
      : leakTotal !== null
        ? formatRandAmount(leakTotal)
        : "—";

  const metaLabel =
    previews.length === 0
      ? "Add a statement to see what you're leaking"
      : leakTotal === null
        ? leakDetections.loading
          ? "Analysing your statements…"
          : "Couldn't analyse your statements right now"
        : `Per month, across ${previews.length} ${previews.length === 1 ? "account" : "accounts"}`;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-2.5 pt-1">
          <HomeHeader
            greeting={firstName ? `${greeting},` : greeting}
            name={firstName}
            initials={initialsFromName(profile?.fullName ?? "")}
            hasUnreadNotifications={hasUnreadNotifications}
            onNotificationsPress={() => router.push("/settings/notifications")}
          />

          <BalanceCard
            heading="Possible leaks this month"
            balance={balanceLabel}
            metaLabel={metaLabel}
            accounts={previews}
            hidden={hideBalances}
            loading={accountsLoading}
            onToggleVisibility={() => {
              void toggleHideBalances();
            }}
            onImportStatement={() => router.push(ADD_ACCOUNT_HREF)}
            onViewAccounts={() => router.push(LINKED_ACCOUNTS_HREF)}
            onAddAccount={() => router.push(ADD_ACCOUNT_HREF)}
          />

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">Biggest findings</Text>
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center gap-0.5 active:opacity-70"
              onPress={() => router.push("/(tabs)/leaks")}
            >
              <Text className="text-[14px] font-semibold text-primary">
                View all
              </Text>
              <ChevronRight
                color={palette.primary}
                size={16}
                strokeWidth={2.4}
              />
            </Pressable>
          </View>
          <View className="gap-2">
            {ranked.length === 0 ? (
              <View className="rounded-3xl bg-card px-4 py-5">
                <Text className="text-[15px] font-semibold text-foreground">
                  {leakDetections.loading ? "Checking your statements…" : "No findings yet"}
                </Text>
                <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  {leakDetections.loading
                    ? "We're analysing your imported activity for money leaks."
                    : "Import statements and we'll surface the biggest leaks here."}
                </Text>
              </View>
            ) : (
              topFindings.map((leak) => (
                <PotentialLeakCard
                  key={leak.id}
                  leak={leak}
                  onPress={(id) => router.push(`/leak/${id}` as never)}
                />
              ))
            )}
          </View>

          <View className="mt-7">
            <UpcomingPayments
              payments={upcomingPayments}
              loading={upcoming.loading}
              error={upcoming.error}
              onSeeAll={() => router.push("/(tabs)/leaks")}
            />
          </View>

          <View className="mt-7">
            <HomeInsights
              insights={insights}
              loading={patternData.loading && !patternData.data}
              noData={!patternData.loading && !patternData.data?.referenceDate}
              onSeeAll={() => router.push("/(tabs)/budget")}
            />
          </View>

          <View className="mt-7">
            <SpendingRhythmCard
              span={rhythmSpan}
              onSpanChange={setRhythmSpan}
              rhythm={rhythm.rhythm}
              loading={rhythm.loading}
              error={rhythm.error}
              onRetry={rhythm.retry}
              isCurrent={rhythm.data?.isCurrent ?? true}
              referenceDate={rhythm.data?.referenceDate ?? null}
            />
          </View>
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
