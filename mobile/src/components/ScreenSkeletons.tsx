import React from "react";
import { ScrollView, View } from "react-native";

import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/cn";

/** Home / history transaction row — Card, icon 40×40 rounded-xl, title + summary, amount + time. */
function SkeletonHomeTransactionRow({ className }: { className?: string }) {
  return (
    <Card className={cn("mb-2.5", className)} contentClassName="flex-row items-start gap-3">
      <Skeleton width={40} height={40} rounded="lg" />
      <View className="min-w-0 flex-1">
        <Skeleton width="72%" height={16} rounded="sm" />
        <Skeleton width="52%" height={14} rounded="sm" className="mt-0.5" />
      </View>
      <View className="items-end gap-0.5">
        <Skeleton width={56} height={14} rounded="sm" />
        <Skeleton width={36} height={11} rounded="sm" />
      </View>
    </Card>
  );
}

/** History list row — adds bank/category chips below summary. */
function SkeletonHistoryTransactionRow({ className }: { className?: string }) {
  return (
    <Card className={cn("mb-2.5", className)} contentClassName="flex-row items-start gap-3">
      <Skeleton width={40} height={40} rounded="lg" />
      <View className="min-w-0 flex-1">
        <Skeleton width="68%" height={16} rounded="sm" />
        <Skeleton width="90%" height={14} rounded="sm" className="mt-0.5" />
        <Skeleton width="78%" height={14} rounded="sm" className="mt-0.5" />
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          <Skeleton width={52} height={22} rounded="md" />
          <Skeleton width={64} height={22} rounded="md" />
        </View>
      </View>
      <View className="items-end gap-0.5">
        <Skeleton width={56} height={14} rounded="sm" />
        <Skeleton width={36} height={11} rounded="sm" />
      </View>
    </Card>
  );
}

/** SMS scanning card — gap-2 layout with 32×32 icon row, summary, amount + category chip. */
function SkeletonSmsScanCard({ className }: { className?: string }) {
  return (
    <Card className={cn("mb-3", className)} contentClassName="gap-2">
      <View className="flex-row items-center gap-2">
        <Skeleton width={32} height={32} rounded="md" />
        <View className="min-w-0 flex-1">
          <Skeleton width="72%" height={16} rounded="sm" />
        </View>
        <Skeleton width={36} height={11} rounded="sm" />
      </View>
      <Skeleton width="92%" height={14} rounded="sm" />
      <Skeleton width="76%" height={14} rounded="sm" />
      <View className="flex-row items-center gap-2">
        <Skeleton width={64} height={14} rounded="sm" />
        <Skeleton width={56} height={22} rounded="md" />
      </View>
    </Card>
  );
}

/** Matches home tab layout — header, health card, actions, leaks card, rewards, transactions. */
export function HomeScreenSkeleton() {
  return (
    <>
      <View className="mb-5 flex-row items-start justify-between">
        <Skeleton width={96} height={11} rounded="sm" />
        <Skeleton width={44} height={44} rounded="full" />
      </View>

      <Card className="mb-5" contentClassName="gap-4">
        <View className="flex-row items-center">
          <Skeleton width={16} height={16} rounded="sm" />
          <Skeleton width={112} height={11} rounded="sm" className="ml-1 flex-1" />
          <Skeleton width={28} height={28} rounded="full" />
        </View>
        <View className="flex-row items-center gap-6">
          <Skeleton width={112} height={112} rounded="full" />
          <View className="flex-1 gap-4">
            <View>
              <Skeleton width={72} height={11} rounded="sm" className="mb-0.5" />
              <Skeleton width={20} height={20} rounded="sm" />
            </View>
            <View>
              <Skeleton width={96} height={11} rounded="sm" className="mb-0.5" />
              <Skeleton width={36} height={20} rounded="sm" />
            </View>
          </View>
        </View>
      </Card>

      <View className="mb-6 flex-row justify-between">
        {Array.from({ length: 4 }, (_, index) => (
          <View key={index} className="flex-1 items-center">
            <Skeleton width={56} height={56} rounded="xl" className="mb-2" />
            <Skeleton width={44} height={28} rounded="sm" />
          </View>
        ))}
      </View>

      <Card
        glass={false}
        className="mb-5 border border-dashed border-brand-purple/30 bg-brand-purple-light dark:border-primary/30 dark:bg-primary/10"
        contentClassName="items-center gap-3 py-6"
      >
        <Skeleton width={56} height={56} rounded="xl" />
        <Skeleton width={168} height={18} rounded="sm" />
        <Skeleton width="82%" height={42} rounded="sm" />
        <View className="mt-1 flex-row items-center gap-1">
          <Skeleton width={104} height={14} rounded="sm" />
          <Skeleton width={16} height={16} rounded="sm" />
        </View>
      </Card>

      <View className="mb-3 mt-6 flex-row items-start justify-between">
        <View className="gap-1">
          <Skeleton width={132} height={18} rounded="sm" />
          <Skeleton width={176} height={11} rounded="sm" />
        </View>
        <Skeleton width={68} height={26} rounded="full" />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-[18px] mb-6"
        contentContainerClassName="gap-3 px-[18px] pb-1"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="w-[140px]" contentClassName="gap-0">
            <Skeleton width={44} height={44} rounded="lg" className="mb-2.5" />
            <Skeleton width={72} height={14} rounded="sm" className="mb-0.5" />
            <Skeleton width="100%" height={32} rounded="sm" className="mb-2" />
            <Skeleton width={48} height={11} rounded="sm" className="mb-2.5" />
            <Skeleton width="100%" height={34} rounded="lg" />
          </Card>
        ))}
      </ScrollView>

      <View className="mb-3 flex-row items-center justify-between">
        <Skeleton width={156} height={18} rounded="sm" />
      </View>

      {Array.from({ length: 3 }, (_, index) => (
        <SkeletonHomeTransactionRow key={index} />
      ))}
    </>
  );
}

/** History list body — date header + transaction rows (header/search/filters stay live). */
export function HistoryListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View className="pt-2">
      <Skeleton width={88} height={11} rounded="sm" className="mb-2.5 mt-3" />
      {Array.from({ length: count }, (_, index) => (
        <SkeletonHistoryTransactionRow key={index} />
      ))}
    </View>
  );
}

/** SMS scanning list body — matches scan result cards (header + progress bar stay live). */
export function SmsScanningListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonSmsScanCard key={index} />
      ))}
    </View>
  );
}

/** Boot / auth gate — home layout inside Screen shell. */
export function SkeletonBoot() {
  return (
    <Screen scrollEnabled={false}>
      <HomeScreenSkeleton />
    </Screen>
  );
}
