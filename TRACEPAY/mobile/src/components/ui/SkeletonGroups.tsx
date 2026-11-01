import { View } from "react-native";

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

/** The small category tile used in the Leaks tab's sideways row. */
export function SkeletonTile() {
  return (
    <View className="gap-2.5 rounded-2xl bg-card p-3.5" style={{ width: 156 }}>
      <Skeleton width="50%" height={12} />
      <Skeleton width="70%" height={20} radius={8} />
      <Skeleton width="30%" height={11} />
      <View className="flex-row gap-1.5">
        <Skeleton width={20} height={20} circle />
        <Skeleton width={20} height={20} circle />
        <Skeleton width={20} height={20} circle />
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
