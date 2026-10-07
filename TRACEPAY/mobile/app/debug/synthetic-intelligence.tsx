import { Redirect, router } from "expo-router";
import { ChevronLeft, FlaskConical } from "lucide-react-native";
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

const GROUPS: { kind: ScenarioCaseKind; title: string }[] = [
  { kind: "positive", title: "Positive" },
  { kind: "negative", title: "Negative" },
  { kind: "edge", title: "Edge" },
];

export default function SyntheticIntelligenceDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <SyntheticIntelligenceDebugScreen />;
}

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
            <IconButton
              accessibilityLabel="Go back"
              variant="ghost"
              onPress={() => router.back()}
            >
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="min-w-0 flex-1">
              <Text className="text-[24px] font-bold text-foreground">
                Synthetic Intelligence Testing
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                Development validation view
              </Text>
            </View>
          </View>

          <View className="mt-5 rounded-3xl bg-card px-4 py-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <FlaskConical color={palette.primary} size={20} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-semibold text-foreground">
                  Synthetic Dataset
                </Text>
                <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                  {catalog?.dataset ?? "Synthetic Intelligence Dataset"}. Results stay
                  out of your account and are not written to the database.
                </Text>
              </View>
            </View>
          </View>

          {loadingCatalog && !catalog ? <LoadingState label="Loading scenarios..." /> : null}
          {error && !analysis ? (
            <ErrorState
              title={catalog ? "Analysis failed" : "Synthetic testing unavailable"}
              message={error}
              onRetry={catalog ? runAnalysis : refreshCatalog}
            />
          ) : null}
          {catalog && catalog.scenarios.length === 0 ? <EmptyState /> : null}

          {catalog && catalog.scenarios.length > 0 ? (
            <View className="mt-5">
              {GROUPS.map((group) => {
                const items = catalog.scenarios.filter(
                  (item) => item.case_kind === group.kind,
                );
                if (items.length === 0) {
                  return null;
                }
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

          {selected ? <ScenarioDetails scenario={selected} /> : null}

          <View className="mt-4">
            <Button
              accessibilityLabel="Run analysis"
              disabled={!selected}
              loading={running}
              size="md"
              onPress={runAnalysis}
            >
              Run analysis
            </Button>
          </View>

          {analysis ? <AnalysisSummary analysis={analysis} /> : null}
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
      <Text className="text-[15px] font-semibold text-foreground">
        {scenarioLabel(scenario)}
      </Text>
      <Text className="mt-0.5 text-[12px] uppercase tracking-[0.6px] text-muted-foreground">
        {scenario.case_kind}
      </Text>
    </Pressable>
  );
}

function ScenarioDetails({ scenario }: { scenario: SyntheticScenario }) {
  return (
    <View className="rounded-3xl bg-card px-4 py-4">
      <Text className="text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
        Scenario
      </Text>
      <Detail label="FI ID" value={scenario.fi_id ?? "Not assigned"} />
      <Detail label="Name" value={scenario.name} />
      <Detail label="Case" value={scenario.case_kind} />
      <Text className="mt-3 text-[14px] leading-5 text-muted-foreground">
        {scenario.summary}
      </Text>
      <Text className="mt-3 text-[13px] text-foreground">{expectedText(scenario)}</Text>
    </View>
  );
}

function AnalysisSummary({ analysis }: { analysis: SyntheticScenarioAnalysis }) {
  return (
    <View className="mt-6">
      <Text className="text-[18px] font-bold text-foreground">Analysis</Text>
      <View className="mt-3 flex-row gap-3">
        <Metric label="Transactions" value={String(analysis.features.transaction_count)} />
        <Metric
          label="Behaviours"
          value={String(analysis.behaviour.observations.length)}
        />
      </View>
      <View className="mt-3 flex-row gap-3">
        <Metric label="Leaks" value={String(analysis.leaks.leaks.length)} />
        <Metric label="Reasoning" value={String(analysis.reasoning.analyses.length)} />
      </View>
      <View className="mt-3">
        <Metric
          label="Recommendations"
          value={String(analysis.recommendations.recommendation_count)}
        />
      </View>

      <ResultList
        title="Behaviour"
        items={analysis.behaviour.observations.map((item) => item.title)}
        empty="No behaviour observations."
      />
      <ResultList
        title="Leaks"
        items={analysis.leaks.leaks.map((item) => item.title)}
        empty="No leaks detected."
      />
      <ResultList
        title="Recommendations"
        items={analysis.recommendations.recommendations.map((item) => item.title)}
        empty="No recommendations."
      />

      <View className="mt-5 gap-3">
        <Button
          accessibilityLabel="Open leak intelligence"
          size="md"
          variant="outline"
          onPress={() =>
            router.push({
              pathname: "/debug/leak-intelligence",
              params: { source: "synthetic" },
            })
          }
        >
          Open leak intelligence
        </Button>
        <Button
          accessibilityLabel="Open financial reasoning"
          size="md"
          variant="outline"
          onPress={() =>
            router.push({
              pathname: "/debug/financial-reasoning",
              params: { source: "synthetic" },
            })
          }
        >
          Open financial reasoning
        </Button>
        <Button
          accessibilityLabel="Open recommendations"
          size="md"
          variant="outline"
          onPress={() =>
            router.push({
              pathname: "/debug/financial-recommendations",
              params: { source: "synthetic" },
            })
          }
        >
          Open recommendations
        </Button>
      </View>
    </View>
  );
}

function ResultList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <View className="mt-5">
      <Text className="text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
        {title}
      </Text>
      {items.length === 0 ? (
        <Text className="mt-2 text-[14px] text-muted-foreground">{empty}</Text>
      ) : (
        <View className="mt-2 gap-2">
          {items.map((item, index) => (
            <View key={`${title}-${index}`} className="rounded-2xl bg-card px-4 py-3">
              <Text className="text-[14px] text-foreground">{item}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-2 flex-row items-center justify-between gap-4">
      <Text className="text-[13px] text-muted-foreground">{label}</Text>
      <Text className="text-right text-[13px] font-semibold capitalize text-foreground">
        {value}
      </Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-3">
      <Text className="text-[12px] font-medium text-muted-foreground">{label}</Text>
      <Text className="mt-1 text-[22px] font-bold text-foreground">{value}</Text>
    </View>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <View className="mt-8 items-center rounded-3xl bg-card px-5 py-10">
      <ActivityIndicator size="large" />
      <Text className="mt-4 text-center text-[15px] font-semibold text-foreground">
        {label}
      </Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View className="mt-5 rounded-3xl bg-card px-5 py-6">
      <Text className="text-[16px] font-semibold text-foreground">
        No synthetic scenarios are available.
      </Text>
    </View>
  );
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <View className="mt-6 rounded-3xl bg-card px-5 py-5">
      <Text className="text-[16px] font-semibold text-destructive">{title}</Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">{message}</Text>
      <Button className="mt-4 self-start" size="sm" variant="outline" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}

function expectedText(scenario: SyntheticScenario): string {
  const expected = scenario.expected;
  const target =
    expected.leak_type ??
    expected.behavior_type ??
    (expected.leak_types.length ? expected.leak_types.join(", ") : "a finding");
  return expected.detected ? `Expected: ${target}` : `Expected absent: ${target}`;
}
