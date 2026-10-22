import { Text, View } from "react-native";

import { Button } from "./Button";

import type { AnthropicAnalysis } from "../../api/anthropic-analysis.api";
import type { AnthropicEvidenceTransaction } from "../../api/anthropic-analysis.api";

export function AnthropicAnalysisCard({ analysis, mode }: { analysis: AnthropicAnalysis | null; mode: "leaks" | "subscriptions" }) {
  if (!analysis) return null;
  const items = mode === "leaks" ? analysis.leaks : analysis.subscriptions;
  return (
    <View className="mt-6 rounded-3xl border border-primary/20 bg-primary/5 px-5 py-5">
      <Text className="text-[12px] font-semibold uppercase tracking-[0.8px] text-primary">Anthropic AI analysis</Text>
      <Text className="mt-1 text-[16px] font-bold text-foreground">
        {analysis.available ? `${items.length} AI ${mode} found` : "AI analysis unavailable"}
      </Text>
      <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
        {analysis.available
          ? "These are additional AI suggestions based on imported transaction descriptions. Review them against the original transactions."
          : "Add an Anthropic API key to enable this development analysis."}
      </Text>
      {analysis.available && items.length > 0 ? (
        <View className="mt-4 gap-3">
          {mode === "leaks"
            ? analysis.leaks.map((item, index) => (
                <View key={`${item.title}-${index}`} className="rounded-2xl bg-card px-4 py-3">
                  <Text className="font-semibold text-foreground">{item.title}</Text>
                  <Text className="mt-1 text-[13px] text-muted-foreground">{item.reason}</Text>
                  <AmountSummary observed={item.observed_amount} monthly={item.monthly_impact} annual={item.annual_impact} />
                  <EvidenceRows rows={item.evidence_transactions} />
                  <Steps steps={item.steps_to_stop} />
                </View>
              ))
            : analysis.subscriptions.map((item, index) => (
                <View key={`${item.merchant}-${item.product}-${index}`} className="rounded-2xl bg-card px-4 py-3">
                  <Text className="font-semibold text-foreground">{item.merchant}{item.product ? ` · ${item.product}` : ""}</Text>
                  <Text className="mt-1 text-[13px] text-muted-foreground">{item.reason}</Text>
                  <AmountSummary observed={item.observed_amount} monthly={item.estimated_monthly_cost} annual={item.estimated_annual_cost} />
                  <EvidenceRows rows={item.evidence_transactions} />
                  <Steps steps={item.steps_to_stop} />
                </View>
              ))}
        </View>
      ) : null}
    </View>
  );
}

/** Button-triggered AI analysis: nothing is requested until the user taps Run. */
export function AnthropicAnalysisSection({
  mode,
  analysis,
  loading,
  error,
  onRun,
}: {
  mode: "leaks" | "subscriptions";
  analysis: AnthropicAnalysis | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
}) {
  return (
    <View className="mt-4">
      <Button
        accessibilityLabel={analysis ? "Run AI analysis again" : "Run AI analysis"}
        loading={loading}
        size="md"
        variant="outline"
        onPress={onRun}
      >
        {analysis ? "Run AI analysis again" : "Run AI analysis"}
      </Button>
      {error ? (
        <Text className="mt-2 text-[13px] text-destructive">{error}</Text>
      ) : null}
      <AnthropicAnalysisCard analysis={analysis} mode={mode} />
    </View>
  );
}

function AmountSummary({ observed, monthly, annual }: { observed: string | null; monthly: string | null; annual: string | null }) {
  return (
    <View className="mt-3 gap-1">
      <Text className="text-[13px] font-semibold text-foreground">Observed total: {observed ?? "Not available"}</Text>
      <Text className="text-[12px] text-muted-foreground">Estimated cost: {monthly ?? "Not available"} / month · {annual ?? "Not available"} / year</Text>
    </View>
  );
}

function EvidenceRows({ rows }: { rows: AnthropicEvidenceTransaction[] }) {
  if (rows.length === 0) return null;
  return (
    <View className="mt-3 gap-1">
      <Text className="text-[12px] font-semibold text-foreground">Transactions used</Text>
      {rows.map((row) => (
        <Text key={row.transaction_id} className="text-[12px] text-muted-foreground">
          {row.date ?? "Date unavailable"} · {row.amount ?? "Amount unavailable"} · {row.description || row.transaction_id}
        </Text>
      ))}
    </View>
  );
}

function Steps({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <View className="mt-3 gap-1">
      <Text className="text-[12px] font-semibold text-foreground">How to stop or reduce it</Text>
      {steps.map((step, index) => (
        <Text key={`${index}-${step}`} className="text-[12px] leading-4 text-muted-foreground">{index + 1}. {step}</Text>
      ))}
    </View>
  );
}
