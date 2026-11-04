import { Redirect, router } from "expo-router";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  Fuel,
  RefreshCw,
  Share2,
  ShoppingCart,
  Smartphone,
  Utensils,
  Wallet,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { answerFindingQuestion, skipFindingQuestion } from "../../src/api/finding-questions.api";
import { FindingQuestionCard } from "../../src/components/leaks/FindingQuestionCard";
import { LeakClaimsSection } from "../../src/components/leaks/LeakClaimsSection";
import { LeakEvidenceSection } from "../../src/components/leaks/LeakEvidenceSection";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { SimpleBrandLogo } from "../../src/components/ui/SimpleBrandLogo";
import { resolveBrandIcon } from "../../src/features/brands/simple-brand-icons";
import {
  feeSources,
  formatConfidence,
  formatCurrency,
  formatFindingEvidence,
  formatIrregularFinding,
  formatTuningReport,
  groupFindingsByValue,
  merchantDisplayName,
  recognisedCategoryKey,
} from "../../src/features/leak-intelligence/leak-intelligence.format";
import type {
  FindingQuestion,
  LeakDetection,
  LeakNearMiss,
  SupportingTransaction,
} from "../../src/features/leak-intelligence/leak-intelligence.types";
import { SyntheticSourceNote } from "../../src/features/synthetic-intelligence/SyntheticSourceNote";
import { scenarioLabel } from "../../src/features/synthetic-intelligence/synthetic-intelligence.parse";
import {
  catalogLogoUrl,
  resolveCatalogLogo,
} from "../../src/features/transactions/merchant-logos";
import { useLeakIntelligenceDebug } from "../../src/hooks/useLeakIntelligenceDebug";
import { useStoredSyntheticAnalysis } from "../../src/hooks/useStoredSyntheticAnalysis";
import { COLORS } from "../../src/theme/colors";

/**
 * Potential leaks, laid out the way the Leaks tab shows them: a short list of
 * findings, each with the amount, how sure we are, what to check, and the evidence
 * one tap away. Nothing here calculates a finding; it only presents the server's.
 */
export default function LeakIntelligenceDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <LeakIntelligenceDebugScreen />;
}

function LeakIntelligenceDebugScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const synthetic = useStoredSyntheticAnalysis();
  const live = useLeakIntelligenceDebug(!synthetic.active);
  const result = synthetic.active ? synthetic.analysis?.leaks ?? null : live.result;
  const loading = synthetic.active ? false : live.loading;
  const error = synthetic.active
    ? synthetic.analysis
      ? null
      : "Run a synthetic scenario before opening this view."
    : live.error;

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
              <Text className="text-[24px] font-bold text-foreground">Potential leaks</Text>
              {result ? (
                <Text className="mt-0.5 text-[14px] text-muted-foreground">
                  {period(result.period_start, result.period_end) ?? "Your statements"}
                </Text>
              ) : null}
            </View>
            {result ? (
              <IconButton
                accessibilityLabel="Share tuning report"
                variant="ghost"
                onPress={() => void Share.share({ message: formatTuningReport(result) })}
              >
                <Share2 color={palette.foreground} size={20} strokeWidth={2} />
              </IconButton>
            ) : null}
            {synthetic.active ? null : (
              <IconButton accessibilityLabel="Refresh" variant="ghost" onPress={live.refresh}>
                <RefreshCw color={palette.foreground} size={20} strokeWidth={2} />
              </IconButton>
            )}
          </View>

          {synthetic.active && synthetic.analysis ? (
            <SyntheticSourceNote scenarioName={scenarioLabel(synthetic.analysis.scenario)} />
          ) : null}

          {loading && !result ? <LoadingState /> : null}
          {error ? <ErrorState message={error} onRetry={live.refresh} /> : null}
          {result ? (
            <Findings
              leaks={result.leaks}
              questions={result.questions ?? []}
              questionsNotShown={result.questions_not_shown ?? 0}
              nearMisses={result.near_misses ?? []}
              updating={loading}
              onQuestionHandled={synthetic.active ? undefined : live.refreshQuietly}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LoadingState() {
  return (
    <View className="mt-8 items-center rounded-3xl bg-card px-5 py-10">
      <ActivityIndicator size="large" />
      <Text className="mt-4 text-center text-[15px] font-semibold text-foreground">
        Analysing your statements…
      </Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="mt-6 rounded-3xl bg-card px-5 py-5">
      <Text className="text-[16px] font-semibold text-destructive">Analysis unavailable</Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">{message}</Text>
      <Button className="mt-4 self-start" variant="outline" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}

function Findings({
  leaks,
  questions,
  questionsNotShown,
  nearMisses,
  updating,
  onQuestionHandled,
}: {
  leaks: LeakDetection[];
  questions: FindingQuestion[];
  questionsNotShown: number;
  nearMisses: LeakNearMiss[];
  updating: boolean;
  /** Reloads the analysis after an answer. Omitted where answers are not saved. */
  onQuestionHandled?: () => void;
}) {
  const [handled, setHandled] = useState<string[]>([]);
  useEffect(() => {
    setHandled([]);
  }, [questions]);
  const pending = onQuestionHandled
    ? questions.filter((item) => !handled.includes(item.question_key))
    : [];
  const done = (question: FindingQuestion) => {
    setHandled((current) => [...current, question.question_key]);
    onQuestionHandled?.();
  };
  const answer = async (question: FindingQuestion, value: string) => {
    await answerFindingQuestion({
      questionKey: question.question_key,
      answer: value,
      signature: question.signature,
    });
    done(question);
  };
  const skip = async (question: FindingQuestion) => {
    await skipFindingQuestion({
      questionKey: question.question_key,
      signature: question.signature,
    });
    done(question);
  };

  return (
    <View className="mt-6">
      {pending.length ? (
        <View className="mb-6 gap-3">
          {pending.map((question) => (
            <FindingQuestionCard
              key={question.question_key}
              question={question}
              onAnswer={answer}
              onSkip={skip}
            />
          ))}
          {questionsNotShown ? (
            <Text className="text-center text-[12px] text-muted-foreground">
              {questionsNotShown} more {questionsNotShown === 1 ? "question" : "questions"} once
              these are done.
            </Text>
          ) : null}
        </View>
      ) : null}

      {leaks.length === 0 ? (
        <View className="rounded-3xl bg-card px-5 py-6">
          <Text className="text-[16px] font-semibold text-foreground">Nothing to review yet</Text>
          <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
            We found nothing worth flagging in your statements. We keep looking as more
            transactions come in.
          </Text>
        </View>
      ) : (
        <>
          <Text className="text-[14px] leading-5 text-muted-foreground">
            We found {leaks.length} {leaks.length === 1 ? "thing" : "things"} worth reviewing.
          </Text>
          {groupFindingsByValue(leaks).map((group) => (
            <View key={group.key} className="mt-6">
              <Text className="text-[17px] font-bold text-foreground">
                {group.title} ({group.leaks.length})
              </Text>
              <Text className="mt-0.5 text-[13px] text-muted-foreground">{group.blurb}</Text>
              <View className="mt-3 gap-3">
                {group.leaks.map((leak) => (
                  <FindingCard key={leak.fingerprint} leak={leak} />
                ))}
              </View>
            </View>
          ))}
        </>
      )}
      <NearMisses items={nearMisses} />
      {updating ? (
        <Text className="mt-3 text-center text-[13px] text-muted-foreground">Updating…</Text>
      ) : null}
    </View>
  );
}

/** Look-alikes the engine passed over, so a missed leak can be traced to the rule behind it. */
function NearMisses({ items }: { items: LeakNearMiss[] }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <View className="mt-8">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 active:opacity-75"
        onPress={() => setOpen((current) => !current)}
      >
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-semibold text-foreground">
            Looked at, not raised ({items.length})
          </Text>
          <Text className="mt-0.5 text-[12px] text-muted-foreground">
            Things that looked like a finding, and the rule that left each one out.
          </Text>
        </View>
        <ChevronDown color={palette.placeholder} size={18} strokeWidth={2} />
      </Pressable>
      {open ? (
        <View className="mt-3 gap-2">
          {items.map((item) => (
            <View
              key={`${item.merchant}-${item.amount}-${item.dates.join()}-${item.reason_code}`}
              className="rounded-2xl bg-card px-4 py-3"
            >
              <Text className="mb-1 text-[11px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
                {KIND_LABELS[item.leak_type] ?? "Finding"}
              </Text>
              <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 text-[14px] font-semibold text-foreground">
                  {item.merchant_display_name ??
                    item.merchant ??
                    (item.leak_type === "bank_fee_leak" ? "Bank fees" : "Unknown merchant")}
                </Text>
                <Text className="text-[14px] font-bold text-foreground">
                  {formatCurrency(item.amount)}
                </Text>
              </View>
              {item.dates.length ? (
                <Text className="mt-0.5 text-[12px] text-muted-foreground">
                  {item.dates.join(" · ")}
                </Text>
              ) : null}
              <Text className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{item.reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- one finding

const KIND_LABELS: Record<string, string> = {
  subscription_leak: "Subscription",
  recurring_payment_leak: "Recurring payment",
  unknown_recurring_payment: "Recurring payment",
  inactive_recurring_payment_leak: "Missed payment",
  duplicate_payment_leak: "Possible duplicate",
  duplicate_debit_order_leak: "Duplicate debit order",
  duplicate_streaming_leak: "Overlapping services",
  bank_fee_leak: "Bank fees",
  cash_usage_leak: "Cash",
  spending_escalation_leak: "Spending increase",
  food_spending_leak: "Spending increase",
  transport_spending_leak: "Spending increase",
  airtime_data_leak: "Airtime & data",
  irregular_transaction_leak: "Unusual payment",
  coffee_spending_leak: "Habit",
  convenience_store_leak: "Habit",
  weekend_spending_leak: "Habit",
  payday_spending_leak: "Habit",
  overlapping_cover_leak: "Overlapping cover",
  gambling_spending_leak: "Habit",
  high_cost_credit_leak: "Credit",
  penalty_fee_leak: "Penalty fees",
  recurring_transfer_leak: "Regular transfers",
  money_pass_through_leak: "Deposits paid out",
};

const STATUS_CHIPS: Record<string, { label: string; container: string; text: string }> = {
  confirmed: { label: "Confirmed", container: "bg-primary/10", text: "text-primary" },
  likely: { label: "Likely", container: "bg-primary/10", text: "text-primary" },
  possible: { label: "Possible", container: "bg-muted", text: "text-muted-foreground" },
};

function FindingCard({ leak }: { leak: LeakDetection }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [open, setOpen] = useState(false);
  const { evidence } = leak;
  const status = typeof evidence.evidence_status === "string" ? evidence.evidence_status : null;
  const chip = status ? STATUS_CHIPS[status] : undefined;
  const amount = impactFor(leak);
  const prompt = verificationPrompt(evidence);
  const merchant = merchantDisplayName(evidence);
  const category = typeof evidence.category_name === "string" ? evidence.category_name : null;

  return (
    <View className="rounded-3xl bg-card px-5 py-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-start gap-3">
          <FindingMark category={category} displayName={merchant} />
          <View className="min-w-0 flex-1">
            <Text className="text-[12px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
              {KIND_LABELS[leak.leak_type] ?? "Finding"}
            </Text>
            <Text className="mt-1 text-[17px] font-bold text-foreground">{leak.title}</Text>
          </View>
        </View>
        {chip ? (
          <View className={`rounded-full px-3 py-1.5 ${chip.container}`}>
            <Text className={`text-[12px] font-semibold ${chip.text}`}>{chip.label}</Text>
          </View>
        ) : null}
      </View>

      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">{leak.description}</Text>

      <View className="mt-4 rounded-2xl bg-muted/40 px-4 py-3">
        <Text className="text-[12px] font-medium text-muted-foreground">{amount.label}</Text>
        <Text className="mt-1 text-[20px] font-bold text-foreground">{amount.value}</Text>
        {amount.notes.map((note) => (
          <Text key={note} className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {note}
          </Text>
        ))}
      </View>

      {prompt ? (
        <View className="mt-3 rounded-2xl bg-primary/5 px-4 py-3">
          <Text className="text-[13px] font-semibold text-primary">Worth checking</Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">{prompt}</Text>
        </View>
      ) : null}

      <FeeBreakdown evidence={evidence} />

      <LeakClaimsSection claims={leak.claims} />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="mt-4 flex-row items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 active:opacity-75"
        onPress={() => setOpen((current) => !current)}
      >
        <Text className="text-[13px] font-semibold text-foreground">
          {open ? "Hide evidence" : "See the evidence"}
        </Text>
        <ChevronDown color={palette.placeholder} size={18} strokeWidth={2} />
      </Pressable>
      {open ? <Evidence leak={leak} /> : null}
    </View>
  );
}

/** Each kind of fee behind a bank-fee finding, with what it cost and what to check. */
function FeeBreakdown({ evidence }: { evidence: Record<string, unknown> }) {
  const sources = feeSources(evidence);
  if (sources.length === 0) return null;
  return (
    <View className="mt-3 gap-3 rounded-2xl bg-muted/40 px-4 py-3">
      <Text className="text-[13px] font-semibold text-foreground">Where the fees come from</Text>
      {sources.map((source) => (
        <View key={source.label}>
          <View className="flex-row items-start justify-between gap-3">
            <Text className="min-w-0 flex-1 text-[14px] font-semibold text-foreground">{source.label}</Text>
            <Text className="text-[14px] font-bold text-foreground">{formatCurrency(source.total)}</Text>
          </View>
          {source.detail ? (
            <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{source.detail}</Text>
          ) : null}
          {source.check ? (
            <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{source.check}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

type Impact = { label: string; value: string; notes: string[] };

/** The amount worth showing for this finding, labelled for what it actually is. */
function impactFor(leak: LeakDetection): Impact {
  const { evidence } = leak;
  const monthly = formatCurrency(leak.estimated_monthly_impact);
  const notes: string[] = [];

  let label: string;
  let value: string;
  if (evidence.headline_impact_basis === "price_increase") {
    label = "Price increase";
    value = `${monthly} a month`;
    const service = toNumber(evidence.service_cost_monthly);
    if (service !== null) notes.push(`The service itself costs ${formatCurrency(service)} a month.`);
  } else if (leak.leak_type === "irregular_transaction_leak") {
    label = "Unusual payment";
    value = monthly;
  } else if (leak.impact_kind === "one_time") {
    label = "Possible extra charge";
    value = monthly;
  } else if (
    leak.leak_type === "spending_escalation_leak" ||
    evidence.growth_is_not_a_confirmed_loss === true
  ) {
    label = "Spending above usual";
    value = `${monthly} a month`;
  } else if (leak.impact_kind === "estimated") {
    label = "Estimated cost";
    value = `${monthly} a month`;
  } else {
    label = "Costs you";
    value = `${monthly} a month`;
  }

  const paid = toNumber(evidence.observed_total_paid);
  if (paid !== null) notes.push(`Paid so far: ${formatCurrency(paid)}.`);
  if (leak.estimated_annual_impact !== null) {
    notes.push(`About ${formatCurrency(leak.estimated_annual_impact)} a year if it continues.`);
  }
  return { label, value, notes };
}

function verificationPrompt(evidence: Record<string, unknown>): string | null {
  if (typeof evidence.verification_prompt === "string") return evidence.verification_prompt;
  if (evidence.finding_kind === "verification_required" && typeof evidence.uncertainty === "string") {
    return evidence.uncertainty;
  }
  return null;
}

// ------------------------------------------------------------------- evidence

function Evidence({ leak }: { leak: LeakDetection }) {
  const { evidence } = leak;
  const rows =
    leak.leak_type === "irregular_transaction_leak"
      ? formatIrregularFinding(evidence)
      : formatFindingEvidence(leak.leak_type, evidence);
  const reason =
    typeof evidence.evidence_status_reason === "string" ? evidence.evidence_status_reason : null;
  const calculation =
    typeof evidence.increase_calculation === "string" ? evidence.increase_calculation : null;

  return (
    <View className="mt-3">
      {reason ? (
        <Text className="text-[13px] leading-5 text-muted-foreground">
          {reason} · Confidence {formatConfidence(leak.confidence)}
        </Text>
      ) : null}
      {calculation ? (
        <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">{calculation}</Text>
      ) : null}

      {rows.length ? (
        <View className="mt-3 gap-2">
          {rows.map((item) => (
            <View
              key={item.label}
              className="flex-row items-start gap-3 rounded-xl bg-muted/40 px-3 py-2.5"
            >
              <Text className="min-w-0 flex-1 text-[13px] text-muted-foreground">{item.label}</Text>
              <Text className="min-w-0 flex-1 text-right text-[13px] font-semibold text-foreground">
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Transactions leak={leak} />
      <LeakEvidenceSection analysis={leak.analysis} />
    </View>
  );
}

function Transactions({ leak }: { leak: LeakDetection }) {
  const { evidence } = leak;
  if (leak.supporting_transactions.length === 0) {
    return (
      <Text className="mt-4 text-[13px] leading-5 text-muted-foreground">
        {typeof evidence.transaction_evidence_reason === "string"
          ? evidence.transaction_evidence_reason
          : "No individual transactions are attached to this finding."}
      </Text>
    );
  }
  const groups = groupTransactions(leak);
  return (
    <View className="mt-4 gap-4">
      {groups.map((group) => (
        <View key={group.title}>
          <Text className="text-[12px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
            {group.title} ({group.rows.length})
          </Text>
          <View className="mt-2 gap-2">
            {group.rows.map((row) => (
              <View key={row.transaction_id} className="rounded-xl bg-muted/40 px-3 py-2.5">
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="text-[12px] text-muted-foreground">{row.date}</Text>
                  <Text className="text-[13px] font-semibold text-foreground">
                    {formatCurrency(row.amount)}
                  </Text>
                </View>
                <Text selectable className="mt-1 text-[12px] text-foreground">
                  {row.description}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      {leak.supporting_transaction_count > leak.supporting_transactions.length ? (
        <Text className="text-[12px] text-muted-foreground">
          Showing the first {leak.supporting_transactions.length} of{" "}
          {leak.supporting_transaction_count}.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * For a rise measured against earlier months, separate the rows that make up the
 * increase from the current month and from the baseline, using only what the
 * finding sent. Any other finding lists its transactions together.
 */
function groupTransactions(leak: LeakDetection): { title: string; rows: SupportingTransaction[] }[] {
  const { evidence } = leak;
  const baseline = new Set(strings(evidence.baseline_months));
  const current = typeof evidence.current_period === "string" ? evidence.current_period : null;
  if (!current || baseline.size === 0) {
    return [{ title: "Transactions", rows: leak.supporting_transactions }];
  }
  const increaseKeys = new Set(
    records(evidence.increase_rows).map(
      (row) => `${String(row.date)}|${(toNumber(row.amount) ?? 0).toFixed(2)}`,
    ),
  );
  const increase: SupportingTransaction[] = [];
  const thisMonth: SupportingTransaction[] = [];
  const earlier: SupportingTransaction[] = [];
  for (const row of leak.supporting_transactions) {
    const key = `${row.date}|${(toNumber(row.amount) ?? 0).toFixed(2)}`;
    if (increaseKeys.has(key)) increase.push(row);
    else if (row.date.slice(0, 7) === current) thisMonth.push(row);
    else earlier.push(row);
  }
  return [
    { title: "What made up the increase", rows: increase },
    { title: "Also this month", rows: thisMonth },
    { title: "Earlier months", rows: earlier },
  ].filter((group) => group.rows.length > 0);
}

// -------------------------------------------------------------------- helpers

function toNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
}

function period(start: string | null, end: string | null): string | null {
  return start && end ? `${start} to ${end}` : null;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  groceries: ShoppingCart,
  shopping: ShoppingCart,
  transport: Fuel,
  fuel: Fuel,
  "airtime & data": Smartphone,
  airtime: Smartphone,
  subscriptions: Wallet,
  "internal transfer": ArrowLeftRight,
  transfer: ArrowLeftRight,
  dining: Utensils,
  food: Utensils,
  restaurants: Utensils,
  "fast food": Utensils,
  "ride hailing": Fuel,
  "public transport": Fuel,
};

function FindingMark({
  displayName,
  category,
}: {
  displayName: string | null;
  category: string | null;
}) {
  const logo = displayName ? resolveCatalogLogo(displayName) : null;
  const [logoFailed, setLogoFailed] = useState(false);
  const categoryKey = recognisedCategoryKey(category);
  const CategoryIcon = categoryKey ? CATEGORY_ICONS[categoryKey] : null;

  useEffect(() => {
    setLogoFailed(false);
  }, [logo?.domain]);

  if (logo && !logoFailed) {
    const bundled = resolveBrandIcon(logo.brandId) ?? resolveBrandIcon(logo.domain);
    if (bundled) {
      return (
        <SimpleBrandLogo
          brandId={logo.brandId}
          name={displayName ?? logo.brandId}
          shape="circle"
          size={40}
        />
      );
    }
    const uri = catalogLogoUrl(logo.domain);
    if (uri) {
      return (
        <Image
          accessibilityLabel={`${displayName} logo`}
          resizeMode="contain"
          source={{ uri }}
          style={{ width: 40, height: 40, borderRadius: 20 }}
          onError={() => setLogoFailed(true)}
        />
      );
    }
  }

  if (!CategoryIcon) {
    return null;
  }
  return (
    <View
      accessibilityLabel={`${category} category`}
      className="items-center justify-center rounded-full bg-muted"
      style={{ width: 40, height: 40 }}
    >
      <CategoryIcon color="#6D3FE0" size={18} strokeWidth={2.2} />
    </View>
  );
}
