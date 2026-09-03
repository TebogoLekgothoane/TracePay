import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Bell, FileText, RefreshCw, Wallet } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AccountsCard } from "../../src/components/dashboard/AccountsCard";
import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { BalanceCard } from "../../src/components/dashboard/BalanceCard";
import { InsightCard } from "../../src/components/dashboard/InsightCard";
import { LeakSummary } from "../../src/components/dashboard/LeakSummary";

export default function HomeScreen() {
  const [balanceHidden, setBalanceHidden] = useState(false);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const leaks = useMemo(
    () => [
      {
        id: "fees",
        title: "Bank fees",
        amount: "R712.50",
        change: "↑ 18%",
        Icon: FileText,
        tint: "#F43F5E",
        tintBg: "rgba(244, 63, 94, 0.15)",
      },
      {
        id: "subs",
        title: "Subscriptions",
        amount: "R430.00",
        change: "↑ 8%",
        Icon: Wallet,
        tint: "#F97316",
        tintBg: "rgba(249, 115, 22, 0.15)",
      },
      {
        id: "unexpected",
        title: "Unexpected",
        amount: "R320.75",
        change: "↑ 5%",
        Icon: RefreshCw,
        tint: "#8B5CF6",
        tintBg: "rgba(139, 92, 246, 0.15)",
      },
    ],
    [],
  );

  const accounts = useMemo(
    () => [
      {
        id: "nedbank",
        name: "Nedbank",
        masked: "•••• 1234",
        balance: "R5,230.40",
        color: "#16A34A",
        kind: "nedbank" as const,
      },
      {
        id: "momo",
        name: "MTN MoMo",
        masked: "•••• 5678",
        balance: "R2,180.35",
        color: "#EAB308",
        kind: "wallet" as const,
      },
      {
        id: "capitec",
        name: "Capitec Bank",
        masked: "•••• 9101",
        balance: "R1,130.00",
        color: "#7C3AED",
        kind: "bank" as const,
      },
    ],
    [],
  );

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
              <LinearGradient
                colors={["#C084FC", "#6366F1"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text className="text-[15px] font-bold text-white">TR</Text>
              </LinearGradient>
              <View>
                <Text className="text-[13px] text-muted-foreground">
                  {greeting}, Tebogo
                </Text>
                <Text className="text-[20px] font-bold tracking-[-0.4px] text-foreground">
                  Welcome back 👋
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
              <Bell color="#FFFFFF" size={22} strokeWidth={2} />
              <View className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            </IconButton>
          </View>

          <BalanceCard
            balance="R 8,540.75"
            changeLabel="↑ 12% vs last month"
            hidden={balanceHidden}
            onToggleVisibility={() => setBalanceHidden((value) => !value)}
            onAddAccount={() => undefined}
            onViewInsights={() => router.push("/(tabs)/budget")}
          />

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">
              Money leaks
            </Text>
            <Button
              onPress={() => router.push("/(tabs)/leaks")}
              size="sm"
              variant="ghost"
              className="px-0"
            >
              View all
            </Button>
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
              router.push("/leak/debit");
            }}
          />

          <View className="mt-7">
            <AccountsCard
              accounts={accounts}
              onAddAccount={() => undefined}
              onSeeDetails={() => undefined}
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
