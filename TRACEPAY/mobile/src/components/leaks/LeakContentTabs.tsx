import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";

import { TRACEPAY } from "../../theme/colors";

export const LEAK_CONTENT_TABS = ["Breakdown", "Insights", "How to fix"] as const;
export type LeakContentTab = (typeof LEAK_CONTENT_TABS)[number];

type Props = {
  active: LeakContentTab;
  onChange: (tab: LeakContentTab) => void;
};

export function LeakContentTabs({ active, onChange }: Props) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="rounded-2xl bg-muted p-1.5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}
      >
        {LEAK_CONTENT_TABS.map((tab) => {
          const selected = tab === active;

          return (
            <Pressable
              key={tab}
              onPress={() => onChange(tab)}
              className="rounded-full px-4 py-2.5 active:opacity-75"
              style={selected ? { backgroundColor: trace.primary } : undefined}
            >
              <Text
                className={`text-[13px] ${selected ? "font-semibold" : "font-medium text-muted-foreground"}`}
                style={selected ? { color: trace.primaryForeground } : undefined}
              >
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
