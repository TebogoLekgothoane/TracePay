import { router, useFocusEffect } from "expo-router";
import {
  Bell,
  ChevronRight,
  Info,
  Landmark,
  ShoppingCart,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState } from "react";
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
import { IconButton } from "../../src/components/ui/IconButton";
import { LINKED_ACCOUNTS_HREF } from "../../src/features/accounts/account.navigation";
import { firstNameFromFullName } from "../../src/features/auth/auth.validation";
import { usePrivacyPreferences } from "../../src/features/privacy/privacy.preferences";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useProfile } from "../../src/hooks/useProfile";
import { getSupabase } from "../../src/lib/supabase";
import { COLORS } from "../../src/theme/colors";

export default function HomeScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { hideBalances, toggleHideBalances } = usePrivacyPreferences();
  const { profile } = useProfile();
  const { previews, loading: accountsLoading } = useAccounts();
  const [totalBalance, setTotalBalance] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getSupabase()
        .from("transactions")
        .select("balance,date,created_at,statement_imports!inner(account_id)")
        .not("balance", "is", null)
        .not("statement_imports.account_id", "is", null)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!active || error) return;
          const latestByAccount = new Map<string, number>();
          for (const row of data ?? []) {
            const relation = Array.isArray(row.statement_imports)
              ? row.statement_imports[0]
              : row.statement_imports;
            const accountId = relation?.account_id;
            if (
              typeof accountId === "string" &&
              !latestByAccount.has(accountId)
            ) {
              const balance = Number(row.balance);
              if (Number.isFinite(balance)) {
                latestByAccount.set(accountId, balance);
              }
            }
          }
          setTotalBalance(
            latestByAccount.size > 0
              ? [...latestByAccount.values()].reduce(
                  (sum, balance) => sum + balance,
                  0,
                )
              : null,
          );
        });
      return () => {
        active = false;
      };
    }, []),
  );

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
        id: "shopping",
        title: "Shopping",
        amount: "R1,240",
        change: "↑ 22%",
        changeDirection: "up",
        Icon: ShoppingCart,
        iconTone: "solid",
        tint: "#2563EB",
        tintBg: "transparent",
        merchants: [
          { id: "shopee", name: "Shopee", logoDomain: "shopee.co.za" },
          { id: "takealot", name: "Takealot", logoDomain: "takealot.com" },
          { id: "mrp", name: "Mr Price", logoDomain: "mrpricegroup.com" },
        ],
        moreCount: 3,
      },
    ],
    [],
  );

  const balanceLabel =
    totalBalance !== null
      ? `R${totalBalance.toLocaleString("en-ZA", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : previews.length > 0
        ? "—"
        : "Add accounts";

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

            <IconButton
              accessibilityLabel="Notifications"
              className="relative"
              variant="ghost"
              size="md"
              onPress={() => router.push("/notifications/1")}
            >
              <Bell color={palette.foreground} size={22} strokeWidth={2} />
              <View className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            </IconButton>
          </View>

          <BalanceCard
            balance={balanceLabel}
            changeLabel="↑ 12% vs last month"
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
              if (item.id === "fees") {
                router.push("/leak/fees?view=summary");
                return;
              }
              if (item.id === "subs") {
                router.push("/leak/subs");
                return;
              }
              if (item.id === "airtime") {
                router.push("/leak/debit");
                return;
              }
              router.push("/leak/debit");
            }}
          />

          <View className="mt-7">
            <AccountsCard
              accounts={previews}
              hideBalances={hideBalances}
              loading={accountsLoading}
              onAddAccount={() => router.push("/transactions/import")}
              onSeeDetails={() => router.push(LINKED_ACCOUNTS_HREF)}
              onAccountPress={() => router.push(LINKED_ACCOUNTS_HREF)}
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
