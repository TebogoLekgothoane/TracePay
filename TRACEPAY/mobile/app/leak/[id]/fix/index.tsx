import { router, useLocalSearchParams } from "expo-router";
import {
  Banknote,
  Calendar,
  FileText,
  Landmark,
  RefreshCw,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FixActionsList } from "../../../../src/components/leaks/FixActionsList";
import {
  LeakFlowShell,
  LeakPrimaryFooter,
} from "../../../../src/components/leaks/LeakFlowShell";
import {
  getFixContent,
  getFixRoute,
  getPrimaryFixActionId,
} from "../../../../src/features/leaks/fixContent";
import { TRACEPAY, getImpactToneStyles, withAlpha } from "../../../../src/theme/colors";

const LEAK_ICONS = {
  fees: FileText,
  subs: RefreshCw,
  debit: Calendar,
  airtime: Banknote,
  atm: Landmark,
} as const;

export default function LeakFixScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const leakId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "fees";
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const trace = TRACEPAY[scheme];
  const content = getFixContent(leakId);

  if (!content) {
    return null;
  }

  const tone = getImpactToneStyles(scheme, content.impact);
  const heroSurface =
    scheme === "dark" ? withAlpha(tone.color, 0.16) : withAlpha(tone.color, 0.1);
  const HeroIcon = LEAK_ICONS[leakId as keyof typeof LEAK_ICONS] ?? FileText;
  const primaryActionId = getPrimaryFixActionId(leakId);

  return (
    <LeakFlowShell
      title={content.title}
      subtitle={`You could save up to ${content.savings} this month`}
      footer={
        <LeakPrimaryFooter
          title="Start with the easiest fix"
          subtitle="Open the first step-by-step guide"
          buttonLabel="Show steps"
          accentColor={trace.splashAccentPink}
          variant="accent"
          onPress={() => {
            if (!primaryActionId) return;
            router.push(getFixRoute(leakId, primaryActionId) as never);
          }}
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
        </View>

        <Text className="mb-4 mt-7 text-[15px] font-semibold text-foreground">
          Pick one action and follow the steps
        </Text>
        <FixActionsList leakId={leakId} sections={content.sections} impact={content.impact} />
      </ScrollView>
    </LeakFlowShell>
  );
}
