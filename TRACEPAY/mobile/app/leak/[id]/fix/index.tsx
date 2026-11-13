import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FixActionsList } from "../../../../src/components/leaks/FixActionsList";
import {
  LeakFlowShell,
  LeakPrimaryFooter,
} from "../../../../src/components/leaks/LeakFlowShell";
import { LeakHero } from "../../../../src/components/leaks/LeakHero";
import {
  getFixContent,
  getFixRoute,
  getPrimaryFixActionId,
} from "../../../../src/features/leaks/fixContent";

export default function LeakFixScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const leakId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "fees";
  const insets = useSafeAreaInsets();
  const content = getFixContent(leakId);

  if (!content) {
    return null;
  }

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
        <LeakHero label="You could save up to" amount={content.savings} caption="this month" />

        <Text className="mb-4 mt-7 text-[15px] font-semibold text-foreground">
          Pick one action and follow the steps
        </Text>
        <FixActionsList leakId={leakId} sections={content.sections} impact={content.impact} />
      </ScrollView>
    </LeakFlowShell>
  );
}
