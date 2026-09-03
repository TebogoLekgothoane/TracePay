import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import {
  LeakFlowShell,
  resolveMarkColor,
} from "../../../../src/components/leaks/LeakFlowShell";
import { Button } from "../../../../src/components/ui/Button";
import { getActionDetail } from "../../../../src/features/leaks/fixContent";
import { COLORS, TRACEPAY, getImpactToneStyles, withAlpha } from "../../../../src/theme/colors";

function PiggyHero({ accent, primary }: { accent: string; primary: string }) {
  return (
    <Svg width={88} height={80} viewBox="0 0 88 80">
      <Circle cx="44" cy="42" r="26" fill={withAlpha(accent, 0.22)} />
      <Circle cx="62" cy="28" r="7" fill={withAlpha(primary, 0.35)} />
      <Circle cx="26" cy="28" r="7" fill={withAlpha(primary, 0.35)} />
      <Rect x="36" y="18" width="16" height="10" rx="5" fill={accent} />
      <Path d="M34 40 H54" stroke={primary} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export default function FixActionDetailScreen() {
  const { id, actionId } = useLocalSearchParams<{ id: string; actionId: string }>();
  const leakId = id ?? "fees";
  const detail = getActionDetail(actionId ?? "");
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const tone = getImpactToneStyles(scheme, "mediumCool");
  const heroSurface =
    scheme === "dark" ? withAlpha(palette.primary, 0.16) : withAlpha(palette.primary, 0.1);

  if (!detail) {
    return null;
  }

  return (
    <LeakFlowShell title={detail.title} subtitle={detail.subtitle}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <View
          className="mt-5 flex-row items-center gap-3 rounded-3xl p-5"
          style={{ backgroundColor: heroSurface }}
        >
          <View className="flex-1">
            <Text className="text-[13px] text-muted-foreground">{detail.savingsLabel}</Text>
            <Text className="mt-1 text-[32px] font-bold text-foreground">{detail.savings}</Text>
            <Text className="mt-0.5 text-[13px] text-muted-foreground">every month</Text>
          </View>
          <PiggyHero accent={trace.splashAccentPink} primary={palette.primary} />
        </View>

        <Text className="mb-2 mt-7 text-[17px] font-bold text-foreground">Why this helps</Text>
        <View className="rounded-3xl bg-muted p-4">
          <Text className="text-[14px] leading-6 text-foreground">{detail.whyThisHelps}</Text>
        </View>

        <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
          {detail.recommendedTitle}
        </Text>
        <View className="gap-2">
          {detail.accounts?.map((account) => (
            <View
              key={account.id}
              className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5"
            >
              <View
                className="h-11 w-11 items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: withAlpha(
                    resolveMarkColor(palette, account.markColor),
                    0.14,
                  ),
                }}
              >
                <Text
                  className="text-[15px] font-bold"
                  style={{ color: resolveMarkColor(palette, account.markColor) }}
                >
                  {account.mark}
                </Text>
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-[14px] font-semibold text-foreground">
                    {account.name}
                  </Text>
                  {account.featured ? (
                    <View
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: withAlpha(palette.success, 0.14) }}
                    >
                      <Text
                        className="text-[10px] font-semibold"
                        style={{ color: palette.success }}
                      >
                        Top pick
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-0.5 text-[12px] text-muted-foreground">
                  {account.monthlyFee} monthly
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-1.5">
                  {account.tags.map((tag) => (
                    <View
                      key={tag}
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: withAlpha(palette.primary, 0.1) }}
                    >
                      <Text className="text-[10px] font-medium text-primary">{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
            </View>
          ))}
        </View>

        <Button
          className="mt-6"
          size="md"
          onPress={() => router.push(`/leak/${leakId}/fix/${actionId}/compare`)}
        >
          {detail.primaryCta}
        </Button>
      </ScrollView>
    </LeakFlowShell>
  );
}
