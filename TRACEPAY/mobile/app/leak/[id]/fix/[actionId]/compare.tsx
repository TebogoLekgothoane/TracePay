import { router, useLocalSearchParams } from "expo-router";
import { ExternalLink, Star } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LeakFlowShell } from "../../../../../src/components/leaks/LeakFlowShell";
import { getActionDetail } from "../../../../../src/features/leaks/fixContent";
import { COLORS, TRACEPAY, withAlpha } from "../../../../../src/theme/colors";

const BANK_HEADERS = ["Nedbank", "Capitec", "TymeBank"];

export default function FixCompareScreen() {
  const { id, actionId } = useLocalSearchParams<{ id: string; actionId: string }>();
  const leakId = id ?? "fees";
  const detail = getActionDetail(actionId ?? "");
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  if (!detail) {
    return null;
  }

  return (
    <LeakFlowShell
      title={detail.primaryCta}
      subtitle="See how the best options stack up side by side."
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        <View className="mt-5 overflow-hidden rounded-3xl bg-muted p-4">
          <View className="flex-row">
            <View className="w-[34%]" />
            {BANK_HEADERS.map((bank) => (
              <View key={bank} className="flex-1 items-center">
                <Text className="text-[11px] font-semibold text-foreground">{bank}</Text>
              </View>
            ))}
          </View>

          {detail.compareRows?.map((row) => (
            <View key={row.label} className="mt-4 flex-row items-center">
              <Text className="w-[34%] text-[12px] text-muted-foreground">{row.label}</Text>
              {row.values.map((value, index) => (
                <Text
                  key={`${row.label}-${index}`}
                  className="flex-1 text-center text-[12px] font-medium text-foreground"
                >
                  {value}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {detail.topPick ? (
          <View
            className="mt-4 rounded-3xl p-4"
            style={{ backgroundColor: withAlpha(palette.success, 0.1) }}
          >
            <View className="flex-row items-center gap-2">
              <Star color={palette.success} size={16} strokeWidth={2.2} fill={palette.success} />
              <Text className="text-[14px] font-bold text-foreground">{detail.topPick.name}</Text>
            </View>
            <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
              {detail.topPick.description}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push(`/leak/${leakId}/fix/${actionId}/guide`)}
          className="mt-6 flex-row items-center justify-center gap-2 rounded-2xl py-3.5 active:opacity-85"
          style={{ backgroundColor: palette.primary }}
        >
          <Text style={{ color: trace.primaryForeground }} className="text-[15px] font-semibold">
            {detail.compareCta}
          </Text>
          <ExternalLink color={trace.primaryForeground} size={16} strokeWidth={2.2} />
        </Pressable>

        <Pressable className="mt-3 items-center rounded-2xl bg-muted py-3.5 active:opacity-80">
          <Text className="text-[14px] font-semibold text-primary">Learn more</Text>
        </Pressable>
      </ScrollView>
    </LeakFlowShell>
  );
}
