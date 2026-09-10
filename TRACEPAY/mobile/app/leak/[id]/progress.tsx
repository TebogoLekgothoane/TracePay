import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Check, ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  LeakFlowShell,
  LeakPrimaryFooter,
} from "../../../src/components/leaks/LeakFlowShell";
import {
  getCompletedActions,
  getFixContent,
  getFixRoute,
} from "../../../src/features/leaks/fixContent";
import { COLORS, TRACEPAY, getImpactToneStyles, withAlpha } from "../../../src/theme/colors";

export default function LeakProgressScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const leakId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "fees";
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const content = getFixContent(leakId);

  if (!content) {
    return null;
  }

  const tone = getImpactToneStyles(scheme, content.impact);
  const completed = getCompletedActions(leakId);
  const total = content.progressActions.length;
  const completedCount = completed.length;
  const progress = total > 0 ? completedCount / total : 0;
  const heroSurface =
    scheme === "dark" ? withAlpha(tone.color, 0.16) : withAlpha(tone.color, 0.1);

  return (
    <LeakFlowShell
      title="Your progress"
      subtitle={`You could save up to ${content.savings} by fixing these leaks.`}
      footer={
        <LeakPrimaryFooter
          title="Take action on remaining leaks"
          subtitle="Keep going — you're already making progress"
          buttonLabel="Continue"
          accentColor={trace.splashAccentPink}
          variant="accent"
          onPress={() => router.push(`/leak/${leakId}/fix`)}
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 160 }}
      >
        <View
          className="mt-5 rounded-3xl p-5"
          style={{ backgroundColor: heroSurface }}
        >
          <Text className="text-[13px] text-muted-foreground">Your progress</Text>
          <Text className="mt-1 text-[22px] font-bold text-foreground">
            {completedCount} of {total} actions completed
          </Text>
          <View className="mt-4 h-2 overflow-hidden rounded-full bg-card">
            <LinearGradient
              colors={[trace.splashPayStart, trace.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: `${Math.max(progress * 100, 8)}%`, height: "100%" }}
            />
          </View>
          <Text className="mt-2 text-[12px] font-semibold" style={{ color: tone.color }}>
            {Math.round(progress * 100)}% complete
          </Text>
        </View>

        <View className="mt-7 gap-2">
          {content.progressActions.map((action) => {
            const isDone = completed.includes(action.id);

            return (
              <View
                key={action.id}
                className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5"
              >
                <View
                  className="h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: isDone
                      ? withAlpha(palette.success, 0.14)
                      : tone.surface,
                  }}
                >
                  {isDone ? (
                    <Check color={palette.success} size={18} strokeWidth={2.5} />
                  ) : (
                    <action.Icon color={tone.color} size={18} strokeWidth={2.2} />
                  )}
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-semibold text-foreground">
                    {action.title}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-muted-foreground">
                    Potential saving: {action.potentialSaving}
                  </Text>
                </View>
                {isDone ? (
                  <View
                    className="rounded-full px-2.5 py-1"
                    style={{ backgroundColor: withAlpha(palette.success, 0.14) }}
                  >
                    <Text
                      className="text-[10px] font-semibold"
                      style={{ color: palette.success }}
                    >
                      Completed
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => router.push(getFixRoute(leakId, action.id) as never)}
                    className="flex-row items-center gap-0.5 active:opacity-75"
                  >
                    <Text className="text-[12px] font-semibold text-primary">Show steps</Text>
                    <ChevronRight color={palette.primary} size={14} strokeWidth={2.5} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </LeakFlowShell>
  );
}
