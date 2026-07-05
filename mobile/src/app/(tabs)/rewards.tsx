import React, { useEffect, useMemo } from "react";
import { View, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";
import { PARTNERS } from "@/constants/partners";
import { cn } from "@/lib/cn";
import { PartnerDealCard } from "@/components/PartnerDealCard";

const EARN_METHODS = [
  { icon: "radar" as const, label: "Scan SMS inbox", sub: "Analyse for new leaks", pts: "+50", color: "#7C3AED", iconBg: "bg-violet-100 dark:bg-primary/20" },
  { icon: "snowflake" as const, label: "Freeze a leak", sub: "Stop an active money leak", pts: "+30", color: "#0284C7", iconBg: "bg-blue-100 dark:bg-blue-900/40" },
  { icon: "account-plus-outline" as const, label: "Invite a friend", sub: "Share TracePay with someone", pts: "+200", color: "#16A34A", iconBg: "bg-green-100 dark:bg-green-900/40" },
  { icon: "brain" as const, label: "Use AI budget", sub: "Generate a weekly plan", pts: "+20", color: "#D97706", iconBg: "bg-amber-100 dark:bg-amber-900/40" },
] as const;

function getLevelInfo(pts: number) {
  if (pts >= 15000) return { name: "Platinum", next: null, nextPts: 15000, progress: 1 };
  if (pts >= 5000) return { name: "Gold", next: "Platinum", nextPts: 15000, progress: (pts - 5000) / 10000 };
  if (pts >= 1000) return { name: "Silver", next: "Gold", nextPts: 5000, progress: (pts - 1000) / 4000 };
  return { name: "Bronze", next: "Silver", nextPts: 1000, progress: pts / 1000 };
}

function formatPoints(points: number) {
  return points.toLocaleString();
}

export default function RewardsScreen() {
  const { colors } = useColorScheme();
  const { rewardPoints, ensureDailyCheckIn } = useProfileStore();

  const level = useMemo(() => getLevelInfo(rewardPoints), [rewardPoints]);

  useEffect(() => {
    void (async () => {
      await ensureDailyCheckIn();
    })();
  }, [ensureDailyCheckIn]);

  const progressPct = Math.min(100, Math.round(level.progress * 100));

  return (
    <Screen contentClassName="pb-6">
      <View className="mb-5">
        <AppText variant="titleLg">Rewards</AppText>
        <AppText variant="bodySm" className="mt-1">
          Earn points automatically while building better money habits
        </AppText>
      </View>

      <Card glass={false} className="relative mb-4 overflow-hidden border-0 bg-[#24155D]">
        <View className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/5" />
        <View className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-white/5" />
        <View className="absolute right-4 top-4">
          <MaterialCommunityIcons name="trophy" size={86} color="#FBBF24" />
        </View>

        <View className="relative z-10 pr-24">
          <AppText variant="overline" className="text-white/70">
            Your balance
          </AppText>
          <AppText variant="display" className="mt-2 text-white">
            {formatPoints(rewardPoints)}
          </AppText>
          <AppText variant="bodySm" className="mt-1 text-white/70">
            TracePoints
          </AppText>
          <AppText variant="caption" className="mt-2 max-w-[220px] text-white/60">
            Daily check-in is automatic when you open the app.
          </AppText>
        </View>

      </Card>

      <Card glass={false} className="mb-4 overflow-hidden border-0 bg-[#10285E]">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <AppText variant="overline" className="text-white/70">
              Your progress
            </AppText>
            <AppText variant="bodySm" className="mt-1 text-white/80">
              Keep making smart financial choices and earn more rewards.
            </AppText>
          </View>
          <View className="h-16 w-16 items-center justify-center rounded-full border-4 border-white/10">
            <AppText variant="title" className="text-white">
              {progressPct}%
            </AppText>
          </View>
        </View>
        {level.next ? (
          <AppText variant="caption" className="mt-3 text-white/60">
            {(level.nextPts - rewardPoints).toLocaleString()} pts to {level.next}
          </AppText>
        ) : null}
      </Card>

      <View className="mb-2 flex-row items-center justify-between">
        <AppText variant="title">Ways to earn</AppText>
        <Button variant="ghost" size="sm" className="min-h-0 px-0">
          <AppText variant="label" className="text-brand-purple dark:text-primary">
            View all
          </AppText>
        </Button>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-[18px] mb-5"
        contentContainerClassName="gap-3 px-[18px] pb-1"
      >
        {EARN_METHODS.map((m) => (
          <Card key={m.label} className="w-[148px]" contentClassName="items-start gap-0">
            <View className={cn("mb-3 h-10 w-10 items-center justify-center rounded-2xl", m.iconBg)}>
              <MaterialCommunityIcons name={m.icon} size={20} color={m.color} />
            </View>
            <AppText variant="label" className="mb-1">
              {m.label}
            </AppText>
            <AppText variant="caption" className="mb-3 leading-4">
              {m.sub}
            </AppText>
            <AppText variant="label" className="text-green-600 dark:text-green-400">
              {m.pts}
            </AppText>
          </Card>
        ))}
      </ScrollView>

      <View className="mb-2 flex-row items-center justify-between">
        <AppText variant="title">Redeem rewards</AppText>
        <Button variant="ghost" size="sm" className="min-h-0 px-0">
          <AppText variant="label" className="text-brand-purple dark:text-primary">
            View all
          </AppText>
        </Button>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-[18px] mb-5"
        contentContainerClassName="gap-3 px-[18px] pb-1"
      >
        {PARTNERS.map((partner) => {
          return (
            <PartnerDealCard key={partner.id} partner={partner} pointsBalance={rewardPoints} className="w-[150px]" />
          );
        })}
      </ScrollView>

      <View className="mb-2 flex-row items-center justify-between">
        <AppText variant="title">Recent wins</AppText>
        <View />
      </View>
      <Card className="mb-4">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-purple-light dark:bg-primary/20">
            <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.primary} />
          </View>
          <View className="flex-1">
            <AppText variant="title">Automatic daily check-in</AppText>
            <AppText variant="caption" className="mt-0.5">
              +1 TracePoint awarded once per day, synced across devices.
            </AppText>
          </View>
          <AppText variant="label" className="text-brand-purple dark:text-primary">
            +1
          </AppText>
        </View>
      </Card>
    </Screen>
  );
}
