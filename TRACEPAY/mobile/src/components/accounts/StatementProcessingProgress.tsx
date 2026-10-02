import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import {
  STATEMENT_IMPORT_STAGE_COPY,
  STATEMENT_IMPORT_STAGE_RATIO,
  estimateExtractionMs,
  extractingProgressRatio,
  formatElapsed,
  formatWaitHint,
  type StatementImportStage,
} from "../../features/statement-import/statement-import.progress";
import { COLORS } from "../../theme/colors";

type Props = {
  stage: StatementImportStage;
  fileSizeBytes?: number | null;
};

const TICK_MS = 400;

export function StatementProcessingProgress({ stage, fileSizeBytes }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [elapsedMs, setElapsedMs] = useState(0);
  const [extractStartedAt, setExtractStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (stage !== "extracting") {
      setExtractStartedAt(null);
      return;
    }
    const startedAt = Date.now();
    setExtractStartedAt(startedAt);
    setElapsedMs(0);
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [stage]);

  const copy = STATEMENT_IMPORT_STAGE_COPY[stage];
  const estimateMs = estimateExtractionMs(fileSizeBytes);
  const ratio =
    stage === "extracting" && extractStartedAt != null
      ? extractingProgressRatio(elapsedMs, estimateMs)
      : STATEMENT_IMPORT_STAGE_RATIO[stage];
  const percent = Math.round(ratio * 100);
  const remainingMs = Math.max(estimateMs - elapsedMs, 0);
  const showWaitHint = stage === "extracting";

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      className="mt-6 rounded-2xl bg-muted/70 px-4 py-4"
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-3 text-[15px] font-semibold text-foreground">{copy.title}</Text>
        <Text className="text-[13px] font-semibold text-primary">{percent}%</Text>
      </View>
      <View className="mt-3 h-2 overflow-hidden rounded-full bg-background">
        <View
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: palette.primary }}
        />
      </View>
      <Text className="mt-3 text-[13px] leading-[18px] text-muted-foreground">
        {copy.detail}
      </Text>
      {showWaitHint ? (
        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-[12px] font-medium text-muted-foreground">
            {formatElapsed(elapsedMs)}
          </Text>
          <Text className="text-[12px] font-semibold text-foreground">
            {formatWaitHint(remainingMs)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
