import { LinearGradient } from "expo-linear-gradient";
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

        if (selected) {
          return (
            <Pressable key={tab} onPress={() => onChange(tab)}>
              <LinearGradient
                colors={[trace.splashPayStart, trace.primary, trace.splashPayEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{ color: trace.primaryForeground }}
                  className="text-[13px] font-semibold"
                >
                  {tab}
                </Text>
              </LinearGradient>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            className="rounded-full px-4 py-2.5 active:opacity-75"
          >
            <Text className="text-[13px] font-medium text-muted-foreground">
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
