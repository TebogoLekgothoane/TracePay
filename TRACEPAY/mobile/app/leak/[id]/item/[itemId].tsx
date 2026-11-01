import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react-native";
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
import { COLORS, getImpactToneStyles } from "../../../../src/theme/colors";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** "20 May" → { day: "20", month: "May" } for the date block on each row. */
function splitDate(date: string): { day: string; month: string } {
  const [day = "", month = ""] = date.split(" ");
  return { day, month };
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
        <Button className="mt-4" onPress={() => router.back()}>
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
  const amounts = item.transactions.map((tx) => parseRandAmount(tx.amount));
  const sum = amounts.reduce((acc, value) => acc + value, 0);
  const average = count > 0 ? formatRandAmount((sum * factor) / count) : null;
  const yearly = formatRandAmount(parseRandAmount(item.amount) * 12);
  const repeats = count > 1 && amounts.every((value) => value === amounts[0]);

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

          <View className="mt-2 rounded-3xl bg-card p-5">
            <Text className="text-[13px] text-muted-foreground">
              Lost to {item.title.toLowerCase()} · {periodLabel.toLowerCase()}
            </Text>
            <Text className="mt-1.5 text-[34px] font-bold tracking-[-0.8px] text-foreground">
              {total}
            </Text>
            {item.percent ? (
              <Text className="mt-1 text-[13px] font-semibold" style={{ color: tone.color }}>
                {item.percent} of your {item.leakTitle.toLowerCase()}
              </Text>
            ) : null}

            <View className="mt-4 flex-row border-t border-border/60 pt-4">
              <Stat label="Charges" value={String(count)} />
              <Stat label="Average" value={average ?? "—"} />
              <Stat label="A year, at this rate" value={yearly} />
            </View>
          </View>

          {repeats ? (
            <View
              className="mt-3 flex-row items-center gap-3 rounded-2xl px-4 py-3"
              style={{ backgroundColor: palette.surfaceSoft }}
            >
              <Lightbulb color={tone.color} size={18} strokeWidth={2.2} />
              <Text className="min-w-0 flex-1 text-[13px] leading-5 text-foreground">
                Charged {count} times for the same amount. This looks like it repeats, so it
                will keep draining until you stop it.
              </Text>
            </View>
          ) : null}

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">Transactions ({count})</Text>
          </View>
          {count > 0 ? (
            <View className="overflow-hidden rounded-3xl bg-card">
              {item.transactions.map((transaction, index) => {
                const { day, month } = splitDate(transaction.date);
                return (
                  <View
                    key={transaction.id}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${
                      index > 0 ? "border-t border-border/60" : ""
                    }`}
                  >
                    <View className="w-9 items-center">
                      <Text className="text-[16px] font-bold leading-[18px] text-foreground">
                        {day}
                      </Text>
                      <Text className="text-[11px] font-medium uppercase text-muted-foreground">
                        {month}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={2}
                      className="min-w-0 flex-1 text-[14px] font-semibold text-foreground"
                    >
                      {transaction.description}
                    </Text>
                    <Text className="text-[14px] font-bold text-foreground">
                      -{scaleRandAmount(transaction.amount, factor)}
                    </Text>
                  </View>
                );
              })}
              <View className="flex-row items-center justify-between border-t border-border/60 px-4 py-3.5">
                <Text className="text-[13px] font-medium text-muted-foreground">Total</Text>
                <Text className="text-[15px] font-bold text-foreground">{total}</Text>
              </View>
            </View>
          ) : (
            <View className="rounded-2xl bg-card px-4 py-5">
              <Text className="text-center text-[13px] text-muted-foreground">
                No transactions found for this period.
              </Text>
            </View>
          )}

          <Pressable
            accessibilityRole={item.fixRoute ? "button" : undefined}
            disabled={!item.fixRoute}
            onPress={() => router.push(item.fixRoute as never)}
            className="mt-5 flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:opacity-80"
            style={{ backgroundColor: palette.surfaceSoft }}
          >
            <View className="min-w-0 flex-1">
              <Text className="text-[14px] font-bold text-foreground">Stop the drain</Text>
              <Text className="mt-0.5 text-[12px] leading-[17px] text-muted-foreground">
                {item.mitigation}
              </Text>
            </View>
            {item.fixRoute ? (
              <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
            ) : null}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="text-[12px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Text className="mt-0.5 text-[16px] font-bold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
