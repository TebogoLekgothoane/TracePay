import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, PlayCircle } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LeakFlowShell } from "../../../../../src/components/leaks/LeakFlowShell";
import { Button } from "../../../../../src/components/ui/Button";
import { getActionDetail } from "../../../../../src/features/leaks/fixContent";
import { COLORS, TRACEPAY, withAlpha } from "../../../../../src/theme/colors";

export default function FixGuideScreen() {
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
    <LeakFlowShell title={detail.guideTitle} subtitle={detail.guideSubtitle}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        <View className="mt-5 gap-2">
          {detail.steps.map((step, index) => (
            <Pressable
              key={step.id}
              className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
            >
              <View
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: withAlpha(palette.primary, 0.12) }}
              >
                <Text className="text-[14px] font-bold text-primary">{index + 1}</Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[14px] font-semibold text-foreground">{step.title}</Text>
                <Text className="mt-0.5 text-[12px] text-muted-foreground">
                  {step.description}
                </Text>
              </View>
              <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
            </Pressable>
          ))}
        </View>

        <View className="mt-7 rounded-3xl bg-muted p-4">
          <Text className="text-[15px] font-bold text-foreground">Need help?</Text>
          <Text className="mt-1 text-[13px] text-muted-foreground">
            Watch a quick guide on switching accounts safely.
          </Text>
          <Pressable className="mt-3 flex-row items-center gap-3 rounded-2xl bg-card p-3 active:opacity-80">
            <View
              className="h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: withAlpha(palette.primary, 0.12) }}
            >
              <PlayCircle color={palette.primary} size={24} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-foreground">
                How to switch accounts
              </Text>
              <Text className="mt-0.5 text-[12px] text-muted-foreground">2 min video</Text>
            </View>
          </Pressable>
        </View>

        <Button
          className="mt-6"
          size="md"
          onPress={() => router.push(`/leak/${leakId}/fix/${actionId}/success`)}
        >
          {detail.guideCta}
        </Button>
      </ScrollView>
    </LeakFlowShell>
  );
}
