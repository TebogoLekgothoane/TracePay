import { router, useLocalSearchParams } from "expo-router";
import { FileText, Landmark, Banknote } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { FixActionsList } from "../../../../src/components/leaks/FixActionsList";
import {
  LeakFlowShell,
  LeakPrimaryFooter,
} from "../../../../src/components/leaks/LeakFlowShell";
import { getFixContent } from "../../../../src/features/leaks/fixContent";
import { COLORS, TRACEPAY, getImpactToneStyles, withAlpha } from "../../../../src/theme/colors";

function PiggyIllustration({ accent, primary }: { accent: string; primary: string }) {
  return (
    <Svg width={72} height={72} viewBox="0 0 72 72">
      <Circle cx="36" cy="38" r="22" fill={withAlpha(accent, 0.25)} />
      <Circle cx="52" cy="28" r="6" fill={withAlpha(primary, 0.35)} />
      <Circle cx="20" cy="28" r="6" fill={withAlpha(primary, 0.35)} />
      <Rect x="30" y="18" width="12" height="8" rx="4" fill={accent} />
      <Circle cx="30" cy="36" r="2" fill={primary} />
    </Svg>
  );
}

export default function LeakFixScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leakId = id ?? "fees";
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const content = getFixContent(leakId);
  const tone = getImpactToneStyles(scheme, content.impact);
  const heroSurface =
    scheme === "dark" ? withAlpha(tone.color, 0.16) : withAlpha(tone.color, 0.1);
  const HeroIcon =
    leakId === "airtime" ? Banknote : leakId === "atm" ? Landmark : FileText;

  return (
    <LeakFlowShell
      title={content.title}
      subtitle={`You could save up to ${content.savings} this month`}
      footer={
        <LeakPrimaryFooter
          title="Take action and save"
          subtitle={
            leakId === "fees"
              ? "Stop unnecessary bank fees now"
              : "Start with the easiest fix first"
          }
          buttonLabel="View progress"
          accentColor={trace.splashAccentPink}
          variant="accent"
          onPress={() => router.push(`/leak/${leakId}/progress`)}
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        <View
          className="mt-5 flex-row items-center gap-3 rounded-3xl p-5"
          style={{ backgroundColor: heroSurface }}
        >
          <View className="flex-1">
            <Text className="text-[13px] text-muted-foreground">You could save up to</Text>
            <Text className="mt-1 text-[30px] font-bold text-foreground">{content.savings}</Text>
            <Text className="mt-0.5 text-[13px] text-muted-foreground">this month</Text>
          </View>
          <View
            className="h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: withAlpha(tone.color, 0.15) }}
          >
            <HeroIcon color={tone.color} size={24} strokeWidth={2.2} />
          </View>
          <PiggyIllustration accent={trace.splashAccentPink} primary={palette.primary} />
        </View>

        <View className="mt-7">
          <FixActionsList leakId={leakId} sections={content.sections} impact={content.impact} />
        </View>
      </ScrollView>
    </LeakFlowShell>
  );
}
