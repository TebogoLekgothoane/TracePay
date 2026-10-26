import { View } from "react-native";

import { Skeleton } from "./Skeleton";

/** A card-shaped row: avatar + two text lines + trailing amount. */
export function SkeletonRow({ trailing = true }: { trailing?: boolean }) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5">
      <Skeleton width={44} height={44} circle />
      <View className="flex-1 gap-2">
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} />
      </View>
      {trailing ? <Skeleton width={64} height={14} /> : null}
    </View>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-2.5">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
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
