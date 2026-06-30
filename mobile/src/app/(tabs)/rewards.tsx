import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";
import { cn } from "@/lib/cn";

const EARN_METHODS = [
  { icon: "radar" as const, label: "Scan SMS Inbox", sub: "Analyse for new leaks", pts: "+50", color: "#7C3AED", iconBg: "bg-violet-100 dark:bg-primary/20" },
  { icon: "snowflake" as const, label: "Freeze a Leak", sub: "Stop an active money leak", pts: "+30", color: "#0284C7", iconBg: "bg-blue-100 dark:bg-blue-900/40" },
  { icon: "account-plus-outline" as const, label: "Invite a Friend", sub: "Share TracePay with someone", pts: "+200", color: "#16A34A", iconBg: "bg-green-100 dark:bg-green-900/40" },
  { icon: "brain" as const, label: "Use AI Budget", sub: "Generate a weekly plan", pts: "+20", color: "#D97706", iconBg: "bg-amber-100 dark:bg-amber-900/40" },
  { icon: "receipt" as const, label: "Pay a Bill", sub: "Via linked account", pts: "+50", color: "#DC2626", iconBg: "bg-red-100 dark:bg-red-900/40" },
];

const PARTNERS = [
  { id: "shoprite", name: "Shoprite", offer: "5% off groceries", pts: 150, color: "#DC2626" },
  { id: "pnp", name: "Pick n Pay", offer: "R20 voucher", pts: 200, color: "#16A34A" },
  { id: "checkers", name: "Checkers", offer: "3% cashback", pts: 180, color: "#0085C7" },
  { id: "clicks", name: "Clicks", offer: "R15 off", pts: 100, color: "#7C3AED" },
  { id: "mrprice", name: "Mr Price", offer: "10% off", pts: 120, color: "#D97706" },
  { id: "woolworths", name: "Woolworths", offer: "8% off food", pts: 160, color: "#111827" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CHECKED_DAYS = [0, 1, 2, 3];

function getLevelInfo(pts: number) {
  if (pts >= 15000) return { name: "Platinum", next: null, nextPts: 15000, progress: 1 };
  if (pts >= 5000) return { name: "Gold", next: "Platinum", nextPts: 15000, progress: (pts - 5000) / 10000 };
  if (pts >= 1000) return { name: "Silver", next: "Gold", nextPts: 5000, progress: (pts - 1000) / 4000 };
  return { name: "Bronze", next: "Silver", nextPts: 1000, progress: pts / 1000 };
}

export default function RewardsScreen() {
  const { colors } = useColorScheme();
  const { rewardPoints, addRewardPoints } = useProfileStore();
  const level = getLevelInfo(rewardPoints);
  const [checkedIn, setCheckedIn] = useState(false);

  const handleCheckIn = () => {
    if (!checkedIn) {
      addRewardPoints(10);
      setCheckedIn(true);
    }
  };

  return (
    <Screen>
      <View className="mb-5">
        <AppText variant="titleLg">Rewards & perks</AppText>
        <AppText variant="bodySm" className="mt-0.5">
          Earn points by improving your finances
        </AppText>
      </View>

      <Card glass={false} className="relative mb-5 overflow-hidden border-0 bg-brand-purple">
        <View className="absolute -right-10 -top-10 h-[140px] w-[140px] rounded-full border border-white/10" />
        <View className="absolute -bottom-5 -left-5 h-[100px] w-[100px] rounded-full border border-white/[0.08]" />

        <View className="mb-4 flex-row items-start justify-between">
          <View>
            <AppText variant="overline" className="mb-1 text-white/70">
              Your points
            </AppText>
            <AppText variant="display" className="text-white">
              {rewardPoints.toLocaleString()}
            </AppText>
          </View>
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5">
            <MaterialCommunityIcons name="medal" size={14} color="#FCD34D" />
            <AppText variant="label" className="text-[#FCD34D]">
              {level.name}
            </AppText>
          </View>
        </View>

        {level.next ? (
          <View className="mb-5">
            <View className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
              <View
                className="h-full rounded-full bg-white"
                style={{ width: `${Math.round(level.progress * 100)}%` }}
              />
            </View>
            <AppText variant="caption" className="text-white/70">
              {(level.nextPts - rewardPoints).toLocaleString()} pts to {level.next}
            </AppText>
          </View>
        ) : null}

        <View className="flex-row justify-around">
          <View className="items-center">
            <AppText variant="title" className="text-white">
              4
            </AppText>
            <AppText variant="caption" className="text-white/65">
              Leaks frozen
            </AppText>
          </View>
          <View className="w-px bg-white/15" />
          <View className="items-center">
            <AppText variant="title" className="text-white">
              R685
            </AppText>
            <AppText variant="caption" className="text-white/65">
              Saved
            </AppText>
          </View>
          <View className="w-px bg-white/15" />
          <View className="items-center">
            <AppText variant="title" className="text-white">
              12
            </AppText>
            <AppText variant="caption" className="text-white/65">
              Days streak
            </AppText>
          </View>
        </View>
      </Card>

      <Card className="mb-4">
        <View className="mb-3.5 flex-row items-center justify-between">
          <AppText variant="title">Daily check-in</AppText>
          <AppText variant="caption">+10 pts per day</AppText>
        </View>
        <View className="mb-3 flex-row gap-1.5">
          {DAYS.map((day, i) => {
            const done = CHECKED_DAYS.includes(i) || (i === 4 && checkedIn);
            const isToday = i === 4;
            return (
              <Pressable
                key={day}
                onPress={isToday && !checkedIn ? handleCheckIn : undefined}
                className={cn(
                  "flex-1 items-center gap-0.5 rounded-[10px] py-2",
                  done ? "bg-primary" : "border border-border bg-muted dark:border-white/10 dark:bg-white/5",
                )}
              >
                <AppText variant="caption" className={cn("font-semibold", done ? "text-white" : "")}>
                  {day}
                </AppText>
                {done ? <MaterialCommunityIcons name="check" size={10} color="#fff" /> : null}
              </Pressable>
            );
          })}
        </View>
        {!checkedIn ? (
          <Button
            variant="outline"
            fullWidth
            onPress={handleCheckIn}
            className="rounded-xl border-primary/30 bg-primary/10 py-3"
            textClassName="text-primary"
            icon={<MaterialCommunityIcons name="calendar-check" size={16} color={colors.primary} />}
          >
            Check in today (+10 pts)
          </Button>
        ) : null}
      </Card>

      <AppText variant="overline" className="mb-2.5">
        More ways to earn
      </AppText>
      <Card className="mb-4" contentClassName="gap-0 px-0 py-0">
        {EARN_METHODS.map((m, i) => (
          <View key={m.label}>
            {i > 0 ? <View className="surface-divider mx-4" /> : null}
            <Pressable className="flex-row items-center gap-3 px-4 py-3 active:opacity-90">
              <View className={cn("h-11 w-11 items-center justify-center rounded-xl", m.iconBg)}>
                <MaterialCommunityIcons name={m.icon} size={20} color={m.color} />
              </View>
              <View className="flex-1">
                <AppText variant="label">{m.label}</AppText>
                <AppText variant="caption" className="mt-0.5">
                  {m.sub}
                </AppText>
              </View>
              <View className="rounded-[10px] bg-brand-purple-light px-2.5 py-1 dark:bg-primary/20">
                <AppText variant="label" className="text-brand-purple dark:text-primary">
                  {m.pts}
                </AppText>
              </View>
            </Pressable>
          </View>
        ))}
      </Card>

      <AppText variant="overline" className="mb-2.5">
        Partner deals
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-[18px] mb-4"
        contentContainerClassName="gap-3 px-[18px]"
      >
        {PARTNERS.map((p) => {
          const canRedeem = rewardPoints >= p.pts;
          return (
            <Card key={p.id} className="w-[140px]" contentClassName="items-center gap-1.5">
              <View
                className="h-12 w-12 items-center justify-center rounded-[14px]"
                style={{ backgroundColor: `${p.color}18` }}
              >
                <AppText variant="title" style={{ color: p.color }}>
                  {p.name[0]}
                </AppText>
              </View>
              <AppText variant="label">{p.name}</AppText>
              <AppText variant="caption" className="text-center">
                {p.offer}
              </AppText>
              <View className="flex-row items-center gap-1">
                <MaterialCommunityIcons name="star-circle-outline" size={12} color={colors.primary} />
                <AppText variant="caption" className="text-brand-purple dark:text-primary">
                  {p.pts} pts
                </AppText>
              </View>
              <Button
                size="sm"
                fullWidth
                disabled={!canRedeem}
                className="mt-1 rounded-[10px] py-2"
                variant={canRedeem ? "primary" : "outline"}
                textClassName={cn(!canRedeem && "text-muted-foreground")}
              >
                {canRedeem ? "Redeem" : "Need more"}
              </Button>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
