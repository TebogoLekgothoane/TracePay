import { Redirect, useLocalSearchParams } from "expo-router";
import { RefreshCw } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { LeakCategoryScreen } from "../../../src/components/leaks/LeakCategoryScreen";
import { IconButton } from "../../../src/components/ui/IconButton";
import { leakDebugCategoryByKey } from "../../../src/features/leak-intelligence/leak-debug-categories";
import { SyntheticSourceNote } from "../../../src/features/synthetic-intelligence/SyntheticSourceNote";
import { scenarioLabel } from "../../../src/features/synthetic-intelligence/synthetic-intelligence.parse";
import { useLeakIntelligenceDebug } from "../../../src/hooks/useLeakIntelligenceDebug";
import { useStoredSyntheticAnalysis } from "../../../src/hooks/useStoredSyntheticAnalysis";
import { COLORS } from "../../../src/theme/colors";

/**
 * Same category frontend as the Leaks tab (`/leak/[id]`), backed by live
 * detections — or the active synthetic scenario when one is selected.
 */
export default function LeakCategoryDebugRoute() {
  const { category: key } = useLocalSearchParams<{ category: string }>();
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  const category = leakDebugCategoryByKey(key);
  if (!category) {
    return <Redirect href="/(tabs)/settings" />;
  }
  return <LeakCategoryDebugScreen categoryKey={category.key} />;
}

function LeakCategoryDebugScreen({ categoryKey }: { categoryKey: string }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const synthetic = useStoredSyntheticAnalysis();
  const live = useLeakIntelligenceDebug(!synthetic.active);
  const category = leakDebugCategoryByKey(categoryKey);
  const result = synthetic.active ? synthetic.analysis?.leaks ?? null : live.result;
  const loading = synthetic.active ? false : live.loading;
  const error = synthetic.active
    ? synthetic.analysis
      ? null
      : "Run a synthetic scenario before opening this view."
    : live.error;

  return (
    <LeakCategoryScreen
      categoryKey={categoryKey}
      debugCategory={category}
      result={result}
      loading={loading}
      error={error}
      onRetry={live.refresh}
      headerEnd={
        synthetic.active ? null : (
          <IconButton accessibilityLabel="Refresh" variant="ghost" onPress={live.refresh}>
            <RefreshCw color={palette.foreground} size={20} strokeWidth={2} />
          </IconButton>
        )
      }
      banner={
        synthetic.active && synthetic.analysis ? (
          <SyntheticSourceNote scenarioName={scenarioLabel(synthetic.analysis.scenario)} />
        ) : null
      }
    />
  );
}
