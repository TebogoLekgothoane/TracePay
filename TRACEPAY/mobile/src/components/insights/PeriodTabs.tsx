import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PERIODS, type Period } from "../../features/insights/period";
import { TRACEPAY } from "../../theme/colors";

type PeriodTabsProps = {
  active: Period;
  onChange: (period: Period) => void;
  /** When set, selected chip uses this solid color instead of the default purple gradient. */
  accentColor?: string;
};

export function PeriodTabs({ active, onChange, accentColor }: PeriodTabsProps) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

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
              className="overflow-hidden rounded-full px-4 py-2.5 active:opacity-75"
              style={
                selected && accentColor ? { backgroundColor: accentColor } : undefined
              }
            >
              {selected && !accentColor ? (
                <LinearGradient
                  pointerEvents="none"
                  colors={[...TRACEPAY.light.summaryGradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
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
