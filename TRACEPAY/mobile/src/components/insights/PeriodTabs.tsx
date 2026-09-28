import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";

import { PERIODS, type Period } from "../../features/insights/period";
import { TRACEPAY } from "../../theme/colors";

type PeriodTabsProps = {
  active: Period;
  onChange: (period: Period) => void;
  selectedColor?: string;
};

export function PeriodTabs({
  active,
  onChange,
  selectedColor,
}: PeriodTabsProps) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];
  const highlight = selectedColor ?? trace.primary;

  return (
    <View className="rounded-2xl bg-muted p-1.5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}
      >
        {PERIODS.map((period) => {
          const selected = period === active;

          return (
            <Pressable
              key={period}
              onPress={() => onChange(period)}
              className="rounded-full px-4 py-2.5 active:opacity-75"
              style={selected ? { backgroundColor: highlight } : undefined}
            >
              <Text
                className={`text-[13px] ${selected ? "font-semibold" : "font-medium text-muted-foreground"}`}
                style={selected ? { color: trace.primaryForeground } : undefined}
              >
                {period}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
