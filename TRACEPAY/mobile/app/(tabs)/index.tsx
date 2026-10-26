import { router } from "expo-router";
import {
  ChevronRight,
  Info,
  Landmark,
  CreditCard,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BalanceCard } from "../../src/components/dashboard/BalanceCard";
import { HomeHeader } from "../../src/components/dashboard/HomeHeader";
import { HomeInsights } from "../../src/components/dashboard/HomeInsights";
import { SpendingRhythmCard } from "../../src/components/dashboard/SpendingRhythmCard";
import { UpcomingPayments } from "../../src/components/dashboard/UpcomingPayments";
import {
  LeakSummary,
  type LeakPreview,
} from "../../src/components/dashboard/LeakSummary";
import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import {
  ADD_ACCOUNT_HREF,
  LINKED_ACCOUNTS_HREF,
} from "../../src/features/accounts/account.navigation";
import type { RhythmSpan } from "../../src/features/dashboard/spending-rhythm";
import { buildSpendingPatterns } from "../../src/features/insights/spending-patterns";
import { formatBalanceAmountLabel } from "../../src/features/accounts/account-balance";
import {
  firstNameFromFullName,
  initialsFromName,
} from "../../src/features/auth/auth.validation";
import { usePrivacyPreferences } from "../../src/features/privacy/privacy.preferences";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useFindingNotifications } from "../../src/hooks/useFindingNotifications";
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
  const { previews, balanceTotals, loading: accountsLoading } = useAccounts();

  const [rhythmSpan, setRhythmSpan] = useState<RhythmSpan>("6 months");
  const rhythm = useSpendingRhythm(rhythmSpan);
  const upcoming = useUpcomingPayments();
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

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = profile ? firstNameFromFullName(profile.fullName) : "";

  const leaks = useMemo<LeakPreview[]>(
    () => [
      {
        id: "fees",
        title: "Bank fees",
        amount: "R712.50",
        change: "↑ 18%",
        changeDirection: "up",
        Icon: Landmark,
        iconTone: "solid",
        tint: "#8B5CF6",
        tintBg: "transparent",
        merchants: [],
      },
      {
        id: "subs",
        title: "Subscriptions",
        amount: "R430.00",
        change: "↑ 8%",
        changeDirection: "up",
        iconTone: "logo",
        tint: "#E50914",
        tintBg: "#111111",
        logoDomain: "netflix.com",
        merchants: [
          { id: "netflix", name: "Netflix", logoDomain: "netflix.com" },
          { id: "spotify", name: "Spotify", logoDomain: "spotify.com" },
          { id: "youtube", name: "YouTube", logoDomain: "youtube.com" },
        ],
        moreCount: 3,
      },
      {
        id: "airtime",
        title: "Airtime & Data",
        amount: "R285.00",
        change: "↓ 12%",
        changeDirection: "down",
        iconTone: "logo",
        tint: "#000000",
        tintBg: "#FFCC00",
        logoDomain: "mtn.co.za",
        merchants: [
          { id: "mtn", name: "MTN", logoDomain: "mtn.co.za" },
          { id: "vodacom", name: "Vodacom", logoDomain: "vodacom.co.za" },
          { id: "cellc", name: "Cell C", logoDomain: "cellc.co.za" },
        ],
      },
      {
        id: "debit",
        title: "Debit orders",
        amount: "R320.75",
        change: "↑ 5%",
        changeDirection: "up",
        Icon: CreditCard,
        iconTone: "solid",
        tint: "#2563EB",
        tintBg: "transparent",
        merchants: [
          { id: "dstv", name: "DStv", logoDomain: "dstv.com" },
        ],
        moreCount: 2,
      },
    ],
    [],
  );

  const balanceLabel =
    balanceTotals.total !== null
      ? formatBalanceAmountLabel(balanceTotals.total)
      : previews.length > 0
        ? "—"
        : "Add accounts";

  const metaLabel =
    previews.length === 0
      ? "Add a statement to see your balance"
      : balanceTotals.subtitle;

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
            balance={balanceLabel}
            metaLabel={metaLabel}
            accounts={previews}
            hidden={hideBalances}
            onToggleVisibility={() => {
              void toggleHideBalances();
            }}
            onImportStatement={() => router.push(ADD_ACCOUNT_HREF)}
            onViewAccounts={() => router.push(LINKED_ACCOUNTS_HREF)}
          />

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-[17px] font-bold text-foreground">
                Money leaks this month
              </Text>
              <Info
                color={palette.mutedForeground}
                size={15}
                strokeWidth={2}
              />
            </View>
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
          <LeakSummary
            items={leaks}
            onItemPress={(item) => {
              router.push(`/leak/${item.id}` as never);
            }}
          />

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

          <View className="mt-7">
            <UpcomingPayments
              payments={upcoming.payments}
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
              onPress={() => router.push("/insights")}
              onSeeAll={() => router.push("/(tabs)/budget")}
            />
          </View>
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
