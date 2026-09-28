import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";

import { TRACEPAY } from "../../theme/colors";

const TABS = ["Overview", "By category", "By account", "By merchant"] as const;

export type LeaksTab = (typeof TABS)[number];

type Props = {
  active: LeaksTab;
  onChange: (tab: LeaksTab) => void;
};

export function LeaksSegmentTabs({ active, onChange }: Props) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}
    >
      {TABS.map((tab) => {
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
  );
}

export function LeaksSegmentTabsContainer({ active, onChange }: Props) {
  return (
    <View className="rounded-2xl bg-muted p-1.5">
      <LeaksSegmentTabs active={active} onChange={onChange} />
    </View>
  );
}
