import React, { useEffect } from "react";
import { View, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface SkeletonProps {
  className?: string;
  style?: ViewStyle;
  width?: number | string;
  height?: number | string;
}

/**
 * Base skeleton with pulse animation. Use for loading placeholders.
 */
export function Skeleton({ className, style, width, height }: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      className={className ? `rounded-lg bg-border ${className}` : "rounded-lg bg-border"}
      style={[
        { width: width ?? "100%", height: height ?? 16 },
        style,
        animatedStyle,
      ]}
    />
  );
}

/** Skeleton matching BankSummaryCard layout */
export function BankSummaryCardSkeleton() {
  return (
    <View className="w-full rounded-2xl bg-bg-card px-5 py-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <Skeleton width={40} height={40} style={{ borderRadius: 8, marginRight: 12 }} />
          <Skeleton width="60%" height={20} />
        </View>
        <Skeleton width={56} height={24} style={{ borderRadius: 999 }} />
      </View>
      <Skeleton width="70%" height={16} style={{ marginTop: 12 }} />
    </View>
  );
}

/** Skeleton matching DiscountCard layout */
export function DiscountCardSkeleton() {
  return (
    <View className="w-full rounded-2xl px-4 py-4 mb-3 border-l-4 border-border bg-bg-card">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-2">
          <Skeleton width="50%" height={18} />
          <Skeleton width="80%" height={14} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={48} height={22} style={{ borderRadius: 8 }} />
      </View>
      <Skeleton width="100%" height={12} style={{ marginTop: 8 }} />
      <Skeleton width="60%" height={12} style={{ marginTop: 6 }} />
      <Skeleton width={80} height={32} style={{ marginTop: 12, borderRadius: 8 }} />
    </View>
  );
}

/** Skeleton for debit order / list row */
export function DebitOrderRowSkeleton() {
  return (
    <View className="rounded-xl p-4 bg-bg-card">
      <View className="flex-row justify-between items-center">
        <Skeleton width={80} height={14} />
        <Skeleton width={60} height={16} />
      </View>
      <Skeleton width="90%" height={16} style={{ marginTop: 8 }} />
      <Skeleton width="70%" height={12} style={{ marginTop: 6 }} />
      <View className="flex-row justify-between items-center mt-3">
        <Skeleton width={50} height={24} style={{ borderRadius: 999 }} />
        <Skeleton width={80} height={36} style={{ borderRadius: 8 }} />
      </View>
    </View>
  );
}

/** Skeleton for account card (freeze / category) */
export function AccountRowSkeleton() {
  return (
    <View className="flex-row justify-between items-center p-4 rounded-xl bg-bg-card">
      <View className="flex-1 mr-4">
        <Skeleton width="70%" height={16} />
        <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={48} height={28} style={{ borderRadius: 14 }} />
    </View>
  );
}

/** Skeleton for AccountCard (category detail) */
export function AccountCardSkeleton() {
  return (
    <View className="w-full rounded-3xl bg-bg-card px-5 py-5 mb-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <Skeleton width={40} height={40} style={{ borderRadius: 8, marginRight: 12 }} />
          <Skeleton width="50%" height={20} />
        </View>
      </View>
      <View className="flex-row mt-3 gap-2">
        <Skeleton width={60} height={24} style={{ borderRadius: 8 }} />
        <Skeleton width={60} height={24} style={{ borderRadius: 8 }} />
        <Skeleton width={60} height={24} style={{ borderRadius: 8 }} />
      </View>
      <Skeleton width="40%" height={24} style={{ marginTop: 12 }} />
      <Skeleton width="100%" height={8} style={{ marginTop: 8, borderRadius: 4 }} />
    </View>
  );
}

/** Skeleton for AutopsyCauseList row (cause title, subtitle, amount) */
export function CauseListItemSkeleton() {
  return (
    <View className="px-5 py-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Skeleton width="70%" height={18} />
          <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={64} height={18} />
      </View>
    </View>
  );
}

/** Skeleton for LeakTransactionRow (date box, merchant, amount) */
export function LeakRowSkeleton() {
  return (
    <View className="flex-row p-4 rounded-xl bg-bg-card mb-2">
      <View className="w-12 h-14 rounded-lg mr-3 overflow-hidden">
        <Skeleton width="100%" height="100%" style={{ borderRadius: 8 }} />
      </View>
      <View className="flex-1 justify-center">
        <Skeleton width="80%" height={16} />
        <Skeleton width="60%" height={12} style={{ marginTop: 6 }} />
      </View>
      <View className="justify-center">
        <Skeleton width={56} height={18} />
      </View>
    </View>
  );
}
