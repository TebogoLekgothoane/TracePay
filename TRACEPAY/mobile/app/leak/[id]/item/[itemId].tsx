import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../../../../src/components/ui/Button";
import { IconButton } from "../../../../src/components/ui/IconButton";
import {
  CUSTOM_RANGES,
  PERIODS,
  formatRandAmount,
  parseRandAmount,
  periodFactor,
  scaleRandAmount,
  type CustomRange,
  type Period,
} from "../../../../src/features/insights/period";
import { getLeakLineItem } from "../../../../src/features/leaks/leak-details";
import { COLORS, getImpactToneStyles, withAlpha } from "../../../../src/theme/colors";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function LeakLineItemScreen() {
  const params = useLocalSearchParams<{
    id: string;
    itemId: string;
    period?: string;
    range?: string;
  }>();
  const leakId = first(params.id) ?? "";
  const itemId = first(params.itemId) ?? "";
  const periodParam = first(params.period);
  const rangeParam = first(params.range);
  const period: Period = PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : "This month";
  const customRange: CustomRange = CUSTOM_RANGES.includes(rangeParam as CustomRange)
    ? (rangeParam as CustomRange)
    : "Last 14 days";

  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

  const item = getLeakLineItem(leakId, itemId);

  if (!item) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-background px-5"
        edges={["top"]}
      >
        <Text className="text-center text-[16px] font-semibold text-foreground">
          This item could not be found.
        </Text>
        <Button className="mt-4" size="md" onPress={() => router.back()}>
          Go back
        </Button>
      </SafeAreaView>
    );
  }

  const tone = getImpactToneStyles(scheme, item.impact);
  const factor = periodFactor(period, customRange);
  const periodLabel = period === "Custom" ? customRange : period;
  const total = scaleRandAmount(item.amount, factor);
  const count = item.transactions.length;
  const average =
    count > 0
      ? formatRandAmount(
          item.transactions.reduce((sum, tx) => sum + parseRandAmount(tx.amount), 0) *
            factor /
            count,
        )
      : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="mb-4 flex-row items-start">
            <IconButton
              accessibilityLabel="Go back"
              className="mr-3 mt-1"
              variant="muted"
              onPress={() => router.back()}
            >
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="min-w-0 flex-1 flex-row items-start gap-3">
              <View className="h-11 w-11 items-center justify-center">
                <item.Icon color={tone.color} size={22} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[12px] font-medium text-muted-foreground">
                  {item.leakTitle}
                </Text>
                <Text className="text-[24px] font-bold text-foreground">{item.title}</Text>
                <Text className="mt-0.5 text-[13px] text-muted-foreground">
                  {item.description}
                </Text>
              </View>
            </View>
          </View>

          <View
            className="mt-2 rounded-3xl p-5"
            style={{ backgroundColor: withAlpha(tone.color, 0.1) }}
          >
            <Text className="text-[13px] text-muted-foreground">Total · {periodLabel}</Text>
            <Text className="mt-1 text-[30px] font-bold tracking-[-0.5px] text-foreground">
              {total}
            </Text>
            <View className="mt-4 flex-row gap-3">
              <Stat label="Charges" value={String(count)} />
              {average ? <Stat label="Avg per charge" value={average} /> : null}
              {item.percent ? (
                <Stat label={`Of ${item.leakTitle.toLowerCase()}`} value={item.percent} />
              ) : null}
            </View>
          </View>

          <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">Transactions</Text>
          {count > 0 ? (
            <View className="gap-2">
              {item.transactions.map((transaction) => (
                <View
                  key={transaction.id}
                  className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5"
                >
                  <View className="h-10 w-10 items-center justify-center">
                    <Receipt color={tone.color} size={18} strokeWidth={2.2} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[14px] font-semibold text-foreground">
                      {transaction.description}
                    </Text>
                    <Text className="mt-0.5 text-[12px] text-muted-foreground">
                      {transaction.date}
                    </Text>
                  </View>
                  <Text className="text-[14px] font-bold text-foreground">
                    -{scaleRandAmount(transaction.amount, factor)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="rounded-2xl bg-card px-4 py-5">
              <Text className="text-center text-[13px] text-muted-foreground">
                No transactions found for this period.
              </Text>
            </View>
          )}

          <View
            className="mt-6 rounded-3xl p-4"
            style={{ backgroundColor: palette.surfaceSoft }}
          >
            <Text className="text-[15px] font-bold text-foreground">How to reduce this</Text>
            <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
              {item.mitigation}
            </Text>
            {item.fixRoute ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(item.fixRoute as never)}
                className="mt-4 flex-row items-center justify-between rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
              >
                <Text className="text-[14px] font-semibold text-foreground">
                  See ways to reduce this
                </Text>
                <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl bg-card px-3 py-2.5">
      <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Text className="mt-0.5 text-[15px] font-bold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
