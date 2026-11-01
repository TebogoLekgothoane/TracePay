import { Redirect, router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { scenarioLabel } from "../../src/features/synthetic-intelligence/synthetic-intelligence.parse";
import type {
  ScenarioCaseKind,
  SyntheticScenario,
  SyntheticScenarioAnalysis,
} from "../../src/features/synthetic-intelligence/synthetic-intelligence.types";
import { useSyntheticIntelligenceDebug } from "../../src/hooks/useSyntheticIntelligenceDebug";
import { COLORS } from "../../src/theme/colors";

/**
 * Try the engine on a made-up customer. Pick a scenario, run it, see whether the
 * engine found what was expected, then open the same screens a real customer sees,
 * filled with that scenario. Nothing is saved to your account.
 */
export default function SyntheticIntelligenceDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <SyntheticIntelligenceDebugScreen />;
}

const GROUPS: { kind: ScenarioCaseKind; title: string }[] = [
  { kind: "positive", title: "Should be found" },
  { kind: "negative", title: "Should not be found" },
  { kind: "edge", title: "Borderline" },
];

const SCREENS: { label: string; pathname: string }[] = [
  { label: "Potential leaks", pathname: "/debug/leak-intelligence" },
  { label: "Why it happened", pathname: "/debug/financial-reasoning" },
  { label: "Next steps", pathname: "/debug/financial-recommendations" },
  { label: "Subscriptions", pathname: "/debug/subscriptions" },
];

function SyntheticIntelligenceDebugScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const {
    catalog,
    selected,
    analysis,
    loadingCatalog,
    running,
    error,
    refreshCatalog,
    selectScenario,
    runAnalysis,
  } = useSyntheticIntelligenceDebug();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <IconButton accessibilityLabel="Go back" variant="ghost" onPress={() => router.back()}>
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="min-w-0 flex-1">
              <Text className="text-[24px] font-bold text-foreground">Test scenarios</Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                Made-up customers. Nothing is saved to your account.
              </Text>
            </View>
          </View>

          {loadingCatalog && !catalog ? (
            <View className="mt-8 items-center rounded-3xl bg-card px-5 py-10">
              <ActivityIndicator size="large" />
              <Text className="mt-4 text-center text-[15px] font-semibold text-foreground">
                Loading scenarios…
              </Text>
            </View>
          ) : null}
          {error && !analysis ? (
            <View className="mt-6 rounded-3xl bg-card px-5 py-5">
              <Text className="text-[16px] font-semibold text-destructive">
                {catalog ? "Run failed" : "Scenarios unavailable"}
              </Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">{error}</Text>
              <Button
                className="mt-4 self-start"
                variant="outline"
                onPress={catalog ? runAnalysis : refreshCatalog}
              >
                Try again
              </Button>
            </View>
          ) : null}

          {catalog && catalog.scenarios.length === 0 ? (
            <View className="mt-5 rounded-3xl bg-card px-5 py-6">
              <Text className="text-[16px] font-semibold text-foreground">
                No scenarios available
              </Text>
            </View>
          ) : null}

          {catalog && catalog.scenarios.length > 0 ? (
            <View className="mt-5">
              {GROUPS.map((group) => {
                const items = catalog.scenarios.filter((item) => item.case_kind === group.kind);
                if (items.length === 0) return null;
                return (
                  <View key={group.kind} className="mb-4">
                    <Text className="mb-2 text-[12px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
                      {group.title}
                    </Text>
                    <View className="gap-2">
                      {items.map((item) => (
                        <ScenarioRow
                          key={item.scenario_id}
                          scenario={item}
                          selected={item.scenario_id === selected?.scenario_id}
                          onPress={() => selectScenario(item.scenario_id)}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {selected ? (
            <View className="rounded-3xl bg-card px-5 py-5">
              <Text className="text-[17px] font-bold text-foreground">{scenarioLabel(selected)}</Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
                {selected.summary}
              </Text>
              <Text className="mt-3 text-[13px] font-semibold text-foreground">
                {expectationText(selected)}
              </Text>
            </View>
          ) : null}

          <View className="mt-4">
            <Button
              accessibilityLabel="Run scenario"
              disabled={!selected}
              loading={running}
              onPress={runAnalysis}
            >
              Run scenario
            </Button>
          </View>

          {analysis ? <Outcome analysis={analysis} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ScenarioRow({
  scenario,
  selected,
  onPress,
}: {
  scenario: SyntheticScenario;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-2xl bg-card px-4 py-3 ${selected ? "border-2 border-primary" : ""}`}
      onPress={onPress}
    >
      <Text className="text-[15px] font-semibold text-foreground">{scenarioLabel(scenario)}</Text>
    </Pressable>
  );
}

function Outcome({ analysis }: { analysis: SyntheticScenarioAnalysis }) {
  const result = verdict(analysis);
  const leaks = analysis.leaks.leaks;
  return (
    <View className="mt-6">
      <View
        className={`rounded-3xl px-5 py-5 ${result.matches ? "bg-primary/10" : "bg-destructive/10"}`}
      >
        <Text
          className={`text-[16px] font-bold ${result.matches ? "text-primary" : "text-destructive"}`}
        >
          {result.matches ? "As expected" : "Not as expected"}
        </Text>
        <Text className="mt-1 text-[14px] leading-5 text-foreground">{result.detail}</Text>
      </View>

      <Text className="mt-5 text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
        Found ({leaks.length})
      </Text>
      {leaks.length === 0 ? (
        <Text className="mt-2 text-[14px] text-muted-foreground">No potential leaks.</Text>
      ) : (
        <View className="mt-2 gap-2">
          {leaks.map((leak) => (
            <View key={leak.fingerprint} className="rounded-2xl bg-card px-4 py-3">
              <Text className="text-[14px] font-semibold text-foreground">{leak.title}</Text>
            </View>
          ))}
        </View>
      )}

      <Text className="mt-6 text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
        See it as a customer would
      </Text>
      <View className="mt-2 gap-2">
        {SCREENS.map((screen) => (
          <Button
            key={screen.pathname}
            accessibilityLabel={`Open ${screen.label}`}
            variant="outline"
            onPress={() =>
              router.push({ pathname: screen.pathname as never, params: { source: "synthetic" } })
            }
          >
            {screen.label}
          </Button>
        ))}
      </View>
    </View>
  );
}

/** Did the engine find what the scenario says it should (or leave alone what it should)? */
function verdict(analysis: SyntheticScenarioAnalysis): { matches: boolean; detail: string } {
  const expected = analysis.scenario.expected;
  const found = new Set(analysis.leaks.leaks.map((leak) => leak.leak_type));
  const behaviours = new Set(analysis.behaviour.observations.map((item) => item.behavior_type));
  const targets = expected.leak_types.length
    ? expected.leak_types
    : expected.leak_type
      ? [expected.leak_type]
      : [];
  const present =
    targets.some((target) => found.has(target)) ||
    (expected.behavior_type !== null && behaviours.has(expected.behavior_type));
  const label = targets.length ? targets.map(humanize).join(", ") : humanize(expected.behavior_type ?? "a finding");
  if (expected.detected) {
    return present
      ? { matches: true, detail: `Found ${label}.` }
      : { matches: false, detail: `Expected ${label}, but it was not found.` };
  }
  return present
    ? { matches: false, detail: `${label} was found, but should not have been.` }
    : { matches: true, detail: `${label} was correctly left out.` };
}

function expectationText(scenario: SyntheticScenario): string {
  const { expected } = scenario;
  const target = expected.leak_types.length
    ? expected.leak_types.map(humanize).join(", ")
    : humanize(expected.leak_type ?? expected.behavior_type ?? "a finding");
  return expected.detected ? `Should find: ${target}` : `Should not find: ${target}`;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
