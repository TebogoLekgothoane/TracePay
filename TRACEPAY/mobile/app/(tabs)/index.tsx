import { router } from "expo-router";
import {
  ChevronRight,
  Info,
  Landmark,
  CreditCard,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AccountsCard } from "../../src/components/dashboard/AccountsCard";
import { BalanceCard } from "../../src/components/dashboard/BalanceCard";
import { InsightCard } from "../../src/components/dashboard/InsightCard";
import {
  LeakSummary,
  type LeakPreview,
} from "../../src/components/dashboard/LeakSummary";
import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import {
  ADD_ACCOUNT_HREF,
  LINKED_ACCOUNTS_HREF,
} from "../../src/features/accounts/account.navigation";
import { formatBalanceAmountLabel } from "../../src/features/accounts/account-balance";
import { formatOverviewAmount } from "../../src/features/analytics/financial-overview.service";
import { firstNameFromFullName } from "../../src/features/auth/auth.validation";
import { usePrivacyPreferences } from "../../src/features/privacy/privacy.preferences";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useFinancialOverview } from "../../src/hooks/useFinancialOverview";
import { useProfile } from "../../src/hooks/useProfile";
import { COLORS } from "../../src/theme/colors";

export default function HomeScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { hideBalances, toggleHideBalances } = usePrivacyPreferences();
  const { profile } = useProfile();
  const { previews, balanceTotals, loading: accountsLoading } = useAccounts();
  const { overview } = useFinancialOverview();

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = profile ? firstNameFromFullName(profile.fullName) : "";
  const greetingLabel = firstName ? `${greeting}, ${firstName}` : greeting;

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
        tint: "#7C3AED",
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

  const flowLabel =
    overview && overview.transactionCount > 0
      ? `In ${formatOverviewAmount(overview.moneyIn)} · Out ${formatOverviewAmount(overview.moneyOut)}`
      : "Import statements to see cash flow";

  const sourceLabel =
    previews.length === 0
      ? "Add a statement to see balance"
      : balanceTotals.subtitle;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-2">
          <View className="mb-5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View>
                <Text
                  className="h-[18px] text-[13px] leading-[18px] text-muted-foreground"
                  numberOfLines={1}
                >
                  {greetingLabel}
                </Text>
                <Text className="text-[20px] font-bold tracking-[-0.4px] text-foreground">
                  Welcome back 
                </Text>
              </View>
            </View>
          </View>

          <BalanceCard
            balance={balanceLabel}
            sourceLabel={sourceLabel}
            changeLabel={flowLabel}
            warningLabel={balanceTotals.warningReason}
            hidden={hideBalances}
            onToggleVisibility={() => {
              void toggleHideBalances();
            }}
            onScanLeaks={() => router.push("/analysis/scanning")}
            onViewInsights={() => router.push("/(tabs)/budget")}
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
              router.push(
                (item.id === "fees"
                  ? "/leak/fees?view=summary"
                  : `/leak/${item.id}`) as never,
              );
            }}
          />

          <View className="mt-7">
            <AccountsCard
              accounts={previews}
              hideBalances={hideBalances}
              loading={accountsLoading}
              onAddAccount={() => router.push(ADD_ACCOUNT_HREF)}
              onSeeDetails={() => router.push(LINKED_ACCOUNTS_HREF)}
              onAccountPress={(account) =>
                router.push(`/settings/accounts/${account.id}` as never)
              }
            />
          </View>

          <View className="mt-7">
            <InsightCard onViewAll={() => router.push("/insights")} />
          </View>
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
