import { View } from "react-native";

import { LEAK_AMOUNT_WIDTH } from "../leaks/LeakAmount";
import { Skeleton } from "./Skeleton";

/** A card-shaped row: avatar + two text lines + trailing amount. */
export function SkeletonRow({ trailing = true, compact = false }: { trailing?: boolean; compact?: boolean }) {
  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl bg-card px-4 ${compact ? "py-2.5" : "py-3.5"}`}
    >
      <Skeleton width={compact ? 40 : 44} height={compact ? 40 : 44} circle />
      <View className="flex-1 gap-2">
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} />
      </View>
      {trailing ? <Skeleton width={64} height={14} /> : null}
    </View>
  );
}

export function SkeletonRows({ count = 3, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <View className={compact ? "gap-2" : "gap-2.5"}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} compact={compact} />
      ))}
    </View>
  );
}

/** Mirrors LeakCategoryCard: 146×112, rounded-[20px], title / amount / change / logos. */
export function SkeletonTile() {
  return (
    <View
      className="overflow-hidden rounded-[20px] bg-card px-4 pb-3 pt-3.5"
      style={{ width: 146, minHeight: 112 }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Skeleton width={17} height={17} radius={4} />
          <Skeleton width="62%" height={13} />
        </View>
        <Skeleton width={16} height={16} radius={4} />
      </View>

      <View className="mt-3">
        <Skeleton width="72%" height={26} radius={8} />
      </View>
      <View className="mt-0.5">
        <Skeleton width="38%" height={13} />
      </View>

      <View className="mt-2 min-h-[28px] flex-row items-center gap-2">
        <Skeleton width={28} height={28} circle />
        <Skeleton width={28} height={28} circle />
        <Skeleton width={28} height={28} circle />
      </View>
    </View>
  );
}

/** Mirrors PotentialLeakCard: 48 icon, title+badge, description, divider, amount, chevron. */
export function SkeletonLeakCard() {
  return (
    <View className="flex-row items-center gap-3 rounded-[20px] bg-card py-3 pl-3 pr-3.5">
      <View className="items-center justify-center" style={{ width: 48, height: 48 }}>
        <Skeleton width={44} height={44} radius={16} />
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Skeleton width="42%" height={16} />
          <Skeleton width={52} height={20} radius={999} />
        </View>
        <View className="mt-0.5">
          <Skeleton width="78%" height={14} />
        </View>
      </View>

      <View className="h-10 w-px bg-border" />
      <View style={{ width: LEAK_AMOUNT_WIDTH, alignItems: "flex-end", gap: 2 }}>
        <Skeleton width={56} height={19} />
        <Skeleton width={64} height={13} />
      </View>
      <Skeleton width={20} height={20} radius={4} />
    </View>
  );
}

export function SkeletonLeakCards({ count = 5 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonLeakCard key={i} />
      ))}
    </View>
  );
}

/** Mirrors the Leaks tab summary hero (rounded-[28px], label / total / pills). */
export function SkeletonLeakSummary() {
  return (
    <View className="overflow-hidden rounded-[28px] bg-card px-5 py-5">
      <Skeleton width="48%" height={13} />
      <View className="mt-1">
        <Skeleton width="56%" height={36} radius={10} />
      </View>
      <View className="mt-4 flex-row gap-2">
        <Skeleton width={88} height={28} radius={999} />
        <Skeleton width={72} height={28} radius={999} />
      </View>
    </View>
  );
}

/** A full card with a title line and a block, for charts and summaries. */
export function SkeletonCard({ height = 140 }: { height?: number }) {
  return (
    <View className="gap-3 rounded-3xl bg-card p-4">
      <Skeleton width="40%" height={14} />
      <Skeleton width="100%" height={height} radius={14} />
    </View>
  );
}
