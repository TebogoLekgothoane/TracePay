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
import {
  DEMO_INSIGHTS,
  DEMO_MODE,
  demoUpcomingPayments,
} from "../../src/features/demo/demo-data";
import type { RhythmSpan } from "../../src/features/dashboard/spending-rhythm";
import { buildSpendingPatterns } from "../../src/features/insights/spending-patterns";
import { rankLeaksByMonthlyCost } from "../../src/features/leaks/leak-paywall";
import { listPotentialLeaks } from "../../src/features/leaks/potential-leaks";
import { formatRandAmount } from "../../src/utils/currency";
import {
  firstNameFromFullName,
  initialsFromName,
} from "../../src/features/auth/auth.validation";
import { usePrivacyPreferences } from "../../src/features/privacy/privacy.preferences";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useFindingNotifications } from "../../src/hooks/useFindingNotifications";
import { useLeakIntelligenceDebug } from "../../src/hooks/useLeakIntelligenceDebug";
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
  const leakDetections = useLeakIntelligenceDebug(previews.length > 0);
  const patternData = useSpendingPatternData();
  const { notifications } = useFindingNotifications();
  const hasUnreadNotifications = notifications.some(
    (notification) => notification.deliveryStatus !== "read",
  );
  const realInsights = useMemo(
    () =>
      patternData.data?.referenceDate
        ? buildSpendingPatterns(patternData.data.rows, patternData.data.referenceDate).insights
        : [],
    [patternData.data],
  );
  // DEMO: fall back to mock data when real data is empty. Remove with features/demo.
  const insights = DEMO_MODE && realInsights.length === 0 ? DEMO_INSIGHTS : realInsights;
  const upcomingPayments = useMemo(
    () =>
      DEMO_MODE && upcoming.payments.length === 0 ? demoUpcomingPayments() : upcoming.payments,
    [upcoming.payments],
  );

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = profile ? firstNameFromFullName(profile.fullName) : "";

  const ranked = useMemo(() => rankLeaksByMonthlyCost(listPotentialLeaks()), []);

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
          leak.analysis?.counted_in_total !== false,
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
            heading="Total leaked this month"
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
            {ranked.slice(0, 2).map((leak) => (
              <PotentialLeakCard
                key={leak.id}
                leak={leak}
                onPress={(id) => router.push(`/leak/${id}` as never)}
              />
            ))}
          </View>

          <View className="mt-7">
            <UpcomingPayments
              payments={upcomingPayments}
              loading={upcoming.loading && !DEMO_MODE}
              error={DEMO_MODE ? null : upcoming.error}
              onSeeAll={() => router.push("/(tabs)/leaks")}
            />
          </View>

          <View className="mt-7">
            <HomeInsights
              insights={insights}
              loading={patternData.loading && !patternData.data && !DEMO_MODE}
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
