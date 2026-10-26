import { router } from "expo-router";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import {
  accountPatternExplanation,
  amountStatusLabel,
  confidenceLevelLabel,
  coverageLimitLabel,
  formatAnalysisAmount,
  formatAnalysisDateRange,
  isConfirmedAmount,
  notCountedInTotalNote,
} from "../../features/leak-intelligence/leak-intelligence.format";
import type { LeakAnalysis } from "../../features/leak-intelligence/leak-intelligence.types";

export const STATEMENT_COVERAGE_HREF = "/statements/coverage" as const;

/** "Evidence" for a backend finding. Renders nothing when the backend sent no analysis block. */
export function LeakEvidenceSection({ analysis }: { analysis: LeakAnalysis | null | undefined }) {
  if (!analysis) return null;
  const dateRange = formatAnalysisDateRange(analysis);
  const pattern = accountPatternExplanation(analysis.account_pattern);
  const notCounted = notCountedInTotalNote(analysis);
  const confirmed = isConfirmedAmount(analysis.amount_status);
  const amountTone =
    analysis.amount_status === "confirmed"
      ? "text-success"
      : analysis.amount_status === "potentially_duplicated"
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <View className="mt-5 rounded-3xl bg-card px-4 py-4">
      <Text className="text-[16px] font-bold text-foreground">Evidence</Text>

      <Block title={confirmed ? "Amount" : "Amount (not a confirmed saving)"}>
        <Text className="text-[18px] font-bold text-foreground">
          {formatAnalysisAmount(analysis.amount, analysis.currency)}
        </Text>
        <Text className={`mt-0.5 text-[13px] font-semibold ${amountTone}`}>
          {amountStatusLabel(analysis.amount_status)}
        </Text>
      </Block>

      {analysis.source_accounts.length > 0 ? (
        <Block title="Accounts involved">
          {analysis.source_accounts.map((account, index) => (
            <View key={`${account.account_id}-${index}`} className="mb-1 flex-row justify-between gap-3">
              <Text className="min-w-0 flex-1 text-[14px] text-foreground" numberOfLines={2}>
                {account.label}
              </Text>
              <Text className="shrink-0 text-[13px] text-muted-foreground">
                {account.transaction_count} txn{account.transaction_count === 1 ? "" : "s"}
                {account.amount !== null
                  ? ` · ${formatAnalysisAmount(account.amount, analysis.currency)}`
                  : ""}
              </Text>
            </View>
          ))}
          {pattern ? (
            <Text className="mt-1 text-[12px] leading-[18px] text-muted-foreground">{pattern}</Text>
          ) : null}
        </Block>
      ) : pattern ? (
        <Block title="Accounts involved">
          <Text className="text-[12px] leading-[18px] text-muted-foreground">{pattern}</Text>
        </Block>
      ) : null}

      {dateRange ? (
        <Block title="Date range">
          <Text className="text-[14px] text-foreground">{dateRange}</Text>
        </Block>
      ) : null}

      <Block title="Confidence">
        <Text className="text-[14px] font-semibold text-foreground">
          {confidenceLevelLabel(analysis.confidence_level)}
        </Text>
        {analysis.confidence_notes.map((note, index) => (
          <Text key={index} className="mt-1 text-[12px] leading-[18px] text-muted-foreground">
            {note}
          </Text>
        ))}
      </Block>

      {analysis.calculation ? (
        <Block title="How this was calculated">
          <Text className="text-[13px] leading-5 text-foreground">{analysis.calculation}</Text>
        </Block>
      ) : null}

      {analysis.coverage_limits.length > 0 ? (
        <Block title="Why this may be incomplete">
          {analysis.coverage_limits.map((limit, index) => (
            <Text
              key={index}
              accessibilityRole="link"
              onPress={() => router.push(STATEMENT_COVERAGE_HREF as never)}
              className="mb-1.5 text-[13px] leading-5 text-foreground"
            >
              {coverageLimitLabel(limit)}{" "}
              <Text className="font-semibold text-primary">See coverage</Text>
            </Text>
          ))}
        </Block>
      ) : null}

      {notCounted ? (
        <Text className="mt-4 text-[12px] leading-[18px] text-muted-foreground">{notCounted}</Text>
      ) : null}
    </View>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-4">
      <Text className="mb-1 text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}
