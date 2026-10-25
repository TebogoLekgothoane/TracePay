import {
  AlertCircle,
  Check,
  ChevronLeft,
  Circle,
  Clock3,
  FileText,
  Hourglass,
  Info,
  Lock,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Tags,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  estimateExtractionMs,
  formatElapsed,
  type StatementImportStage,
} from "../../features/statement-import/statement-import.progress";
import {
  ADD_ANOTHER_STATEMENT_LABEL,
  COVERAGE_NOTES,
  DONE_LABEL,
  queueStatusLabel,
  queueSummaryHeadline,
  queueSummaryLines,
  type QueueItemStatus,
  type QueueSummary,
} from "../../features/statement-import/statement-import.messages";
import { COLORS } from "../../theme/colors";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { PasswordInput } from "../ui/PasswordInput";

const TICK_MS = 400;

const LINE_WIDTHS = [78, 92, 64, 86, 70, 54] as const;

const STEPS: ReadonlyArray<{
  title: string;
  headline: string;
  detail: (bankName: string | null) => string;
  Icon: LucideIcon;
}> = [
  {
    title: "Upload",
    headline: "Uploading file",
    detail: (bank) =>
      bank
        ? `Uploading your ${bank} statement securely.`
        : "Uploading your statement securely.",
    Icon: Upload,
  },
  {
    title: "Extract",
    headline: "Extracting transactions",
    detail: (bank) =>
      bank
        ? `Reading every line on your ${bank} statement.`
        : "Reading every line on your statement.",
    Icon: FileText,
  },
  {
    title: "Sort",
    headline: "Matching merchants",
    detail: (bank) =>
      bank
        ? `Reading your ${bank} statement and identifying transactions.`
        : "Reading your statement and identifying transactions.",
    Icon: Tags,
  },
  {
    title: "Trace",
    headline: "Finding leaks",
    detail: (bank) =>
      bank
        ? `Checking fees and recurring charges on your ${bank} statement.`
        : "Checking fees and recurring charges on your statement.",
    Icon: ScanSearch,
  },
  {
    title: "Save",
    headline: "Saving results",
    detail: () => "Writing everything to your account.",
    Icon: Sparkles,
  },
];

function usePalette() {
  const { colorScheme } = useColorScheme();
  return COLORS[colorScheme === "dark" ? "dark" : "light"];
}

function useImportClock(stage: StatementImportStage) {
  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());
  const [extractStartedAt, setExtractStartedAt] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (stage === "extracting") {
      setExtractStartedAt((current) => current ?? Date.now());
      return;
    }
    setExtractStartedAt(null);
  }, [stage]);

  return {
    elapsedMs: now - startedAt,
    extractElapsedMs: extractStartedAt == null ? 0 : now - extractStartedAt,
  };
}

function stepIndex(stage: StatementImportStage, extractElapsedMs: number): number {
  if (stage === "preparing" || stage === "uploading") return 0;
  if (stage === "saving") return 4;
  if (extractElapsedMs < 8_000) return 1;
  if (extractElapsedMs < 18_000) return 2;
  return 3;
}

function progressPercent(stage: StatementImportStage, extractElapsedMs: number): number {
  const current = stepIndex(stage, extractElapsedMs);
  if (stage === "extracting" && extractElapsedMs >= 40_000) {
    // The processor returns one response after extraction, categorisation, and
    // intelligence checks. Keep the indicator alive without pretending that
    // the client knows the exact backend percentage.
    const longRunningSteps = Math.floor((extractElapsedMs - 40_000) / 15_000);
    return Math.min(88, 77 + longRunningSteps);
  }
  const within =
    stage === "extracting" ? Math.min(extractElapsedMs / 40_000, 0.85) : 0.35;
  return Math.min(96, Math.max(8, Math.round(((current + within) / STEPS.length) * 100)));
}

function formatRemainingCompact(remainingMs: number, elapsedMs: number): string {
  if (elapsedMs >= 240_000 || remainingMs <= 0) return "Still working";
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (seconds <= 15) return "Almost done";
  if (seconds < 60) return `~${seconds}s remaining`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes}m remaining`;
}

function extractingCopy(bankName: string | null, elapsedMs: number) {
  if (elapsedMs < 40_000) {
    return {
      headline: "Extracting transactions",
      detail: bankName
        ? `Reading every line on your ${bankName} statement.`
        : "Reading every line on your statement.",
    };
  }
  if (elapsedMs < 120_000) {
    return {
      headline: "Matching your transactions",
      detail: "The statement is large, so TracePay is sorting merchants and categories.",
    };
  }
  if (elapsedMs < 240_000) {
    return {
      headline: "Finishing the analysis",
      detail: "TracePay is checking recurring charges, fees, and transfers. Your import is still running.",
    };
  }
  return {
    headline: "Still working on your statement",
    detail: "This statement is taking longer than usual. Keep this screen open while TracePay finishes safely.",
  };
}

function Header({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}) {
  const palette = usePalette();
  return (
    <View className="relative min-h-11 flex-row items-center justify-center px-4">
      <View className="absolute left-3 z-10 w-11">
        {onBack ? (
          <IconButton accessibilityLabel="Go back" variant="outline" onPress={onBack}>
            <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
          </IconButton>
        ) : null}
      </View>
      <Text className="text-[17px] font-semibold text-foreground" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const width = Math.max(0, Math.min(100, percent));

  return (
    <View className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <View className="h-1.5 rounded-full bg-primary" style={{ width: `${width}%` }} />
    </View>
  );
}

function DocumentCard({
  bankName,
  percent,
}: {
  bankName?: string | null;
  percent: number;
}) {
  const palette = usePalette();
  const label = bankName ? `${bankName.toUpperCase()} STATEMENT` : "BANK STATEMENT";

  return (
    <View className="w-[220px] rounded-3xl border border-border bg-card px-4 pb-3.5 pt-4">
      <View className="mb-3.5 flex-row items-center">
        <FileText color={palette.primary} size={16} strokeWidth={2.2} />
        <Text
          className="ml-2 text-[11px] font-semibold uppercase tracking-[0.7px] text-muted-foreground"
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <View className="mb-4 gap-2.5">
        {LINE_WIDTHS.map((width) => (
          <View key={width} className="h-2 rounded-full bg-muted" style={{ width: `${width}%` }} />
        ))}
      </View>
      <ProgressBar percent={percent} />
    </View>
  );
}

function ConnectedStepper({ current }: { current: number }) {
  const palette = usePalette();

  return (
    <View className="flex-row items-start">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const Icon = step.Icon;
        const reached = done || active;
        const lineReached = index <= current;
        const nextReached = index < current;

        return (
          <View key={step.title} className="flex-1 items-center">
            <View className="w-full flex-row items-center">
              {index > 0 ? (
                <View
                  className={`h-0 flex-1 border-t-[1.5px] ${
                    lineReached
                      ? "border-solid border-primary"
                      : "border-dashed border-border"
                  }`}
                />
              ) : (
                <View className="flex-1" />
              )}
              <View
                className={`h-7 w-7 items-center justify-center rounded-full border-[1.5px] ${
                  done
                    ? "border-primary bg-primary"
                    : active
                      ? "border-primary bg-primary/10"
                      : "border-solid border-border bg-card"
                }`}
              >
                {done ? (
                  <Check color={COLORS.white} size={14} strokeWidth={3} />
                ) : (
                  <Icon
                    color={active ? palette.primary : palette.mutedForeground}
                    size={14}
                    strokeWidth={2.2}
                  />
                )}
              </View>
              {index < STEPS.length - 1 ? (
                <View
                  className={`h-0 flex-1 border-t-[1.5px] ${
                    nextReached
                      ? "border-solid border-primary"
                      : "border-dashed border-border"
                  }`}
                />
              ) : (
                <View className="flex-1" />
              )}
            </View>
            <Text
              className={`mt-2 text-center text-[11px] font-semibold ${
                reached ? "text-foreground" : "text-muted-foreground"
              }`}
              numberOfLines={1}
            >
              {step.title}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export type QueueStatusRow = {
  id: string;
  name: string;
  status: QueueItemStatus;
  detail?: string | null;
};

function statusIcon(status: QueueItemStatus, palette: ReturnType<typeof usePalette>) {
  switch (status) {
    case "saved":
    case "already_imported":
      return <Check color={palette.primary} size={16} strokeWidth={2.6} />;
    case "reading":
      return <RefreshCw color={palette.primary} size={15} strokeWidth={2.2} />;
    case "password":
      return <Lock color={palette.mutedForeground} size={15} strokeWidth={2.2} />;
    case "problem":
    case "empty":
      return <AlertCircle color={palette.destructive} size={16} strokeWidth={2.2} />;
    default:
      return <Circle color={palette.mutedForeground} size={14} strokeWidth={2} />;
  }
}

export function QueueStatusList({ rows }: { rows: ReadonlyArray<QueueStatusRow> }) {
  const palette = usePalette();
  return (
    <View className="w-full rounded-3xl border border-border bg-card">
      {rows.map((row, index) => (
        <View key={row.id}>
          {index > 0 ? <View className="mx-4 h-px bg-border" /> : null}
          <View className="flex-row items-start gap-3 px-4 py-3">
            <View className="mt-0.5 w-5 items-center">{statusIcon(row.status, palette)}</View>
            <View className="min-w-0 flex-1">
              <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                {row.name}
              </Text>
              <Text
                className={`mt-0.5 text-[12px] leading-4 ${
                  row.status === "problem" ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {row.detail
                  ? `${queueStatusLabel(row.status)} · ${row.detail}`
                  : queueStatusLabel(row.status)}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Plain explanation of what more statements do, and what TracePay cannot see. */
export function CoverageNotes() {
  const palette = usePalette();
  return (
    <View className="flex-row items-start gap-3 rounded-3xl bg-primary/10 px-4 py-3.5">
      <Info color={palette.primary} size={16} strokeWidth={2.2} style={{ marginTop: 2 }} />
      <View className="min-w-0 flex-1 gap-1.5">
        {COVERAGE_NOTES.map((note) => (
          <Text key={note} className="text-[13px] leading-5 text-foreground">
            {note}
          </Text>
        ))}
      </View>
    </View>
  );
}

type ProcessingProps = {
  /** Shown above the progress when several statements are queued. */
  queueLabel?: string | null;
  queueRows?: ReadonlyArray<QueueStatusRow>;
  stage: StatementImportStage;
  fileSizeBytes?: number | null;
  bankName?: string | null;
  onCancel: () => void;
};

export function StatementProcessingScreen({
  queueLabel,
  queueRows,
  stage,
  fileSizeBytes,
  bankName,
  onCancel,
}: ProcessingProps) {
  const palette = usePalette();
  const { elapsedMs, extractElapsedMs } = useImportClock(stage);
  const current = stepIndex(stage, extractElapsedMs);
  const percent = progressPercent(stage, extractElapsedMs);
  const remainingMs = Math.max(estimateExtractionMs(fileSizeBytes) - extractElapsedMs, 0);
  const step = STEPS[current];
  const copy =
    stage === "extracting"
      ? extractingCopy(bankName ?? null, extractElapsedMs)
      : { headline: step.headline, detail: step.detail(bankName ?? null) };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <Header title="Tracing statement" onBack={onCancel} />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="px-5 pb-7 pt-2">
          <View className="items-center pt-2">
            <DocumentCard bankName={bankName} percent={percent} />

            {queueLabel ? (
              <Text
                className="mt-5 max-w-[320px] text-center text-[13px] font-semibold text-primary"
                numberOfLines={2}
              >
                {queueLabel}
              </Text>
            ) : null}
            <Text className="mt-6 text-[30px] font-bold tracking-[-0.7px] text-foreground">
              {percent}%
            </Text>
            <Text className="mt-2 text-[24px] font-bold tracking-[-0.4px] text-foreground">
              {copy.headline}
            </Text>
            <Text className="mt-2 max-w-[300px] text-center text-[14px] leading-5 text-muted-foreground">
              {copy.detail}
            </Text>

            <View className="mt-4 flex-row items-center justify-center gap-2">
              <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
                <Clock3 color={palette.mutedForeground} size={13} strokeWidth={2.2} />
                <Text className="text-[12px] font-medium text-muted-foreground">
                  {formatElapsed(elapsedMs)}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
                <Hourglass color={palette.mutedForeground} size={13} strokeWidth={2.2} />
                <Text className="text-[12px] font-medium text-muted-foreground">
                  {formatRemainingCompact(remainingMs, extractElapsedMs)}
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-7 rounded-3xl border border-border bg-card px-3.5 pb-4 pt-[18px]">
            <ConnectedStepper current={current} />

            <View className="mt-5 flex-row items-center gap-3">
              <View className="flex-1">
                <ProgressBar percent={percent} />
              </View>
              <Text className="text-[12px] font-semibold text-primary">{percent}%</Text>
            </View>

            <View className="mt-4 flex-row items-center justify-center gap-1.5">
              <ShieldCheck color={palette.primary} size={13} strokeWidth={2.2} />
              <Text className="text-[12px] text-muted-foreground">
                Your financial data stays private.
              </Text>
            </View>
          </View>

          {queueRows && queueRows.length > 1 ? (
            <View className="mt-4">
              <QueueStatusList rows={queueRows} />
            </View>
          ) : null}

          <View className="mt-4 flex-row items-start gap-3 rounded-3xl bg-primary/10 px-4 py-3.5">
            <Info
              color={palette.primary}
              size={16}
              strokeWidth={2.2}
              style={{ marginTop: 1 }}
            />
            <Text className="min-w-0 flex-1 text-[13px] leading-5 text-foreground">
              Please stay on this screen until tracing finishes. Leaving TracePay
              or switching apps can stop the scan, and you’ll need to upload
              again.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View className="border-t border-border px-5 pb-2 pt-4">
        <Button variant="outline" onPress={onCancel}>
          Cancel
        </Button>
      </View>
    </SafeAreaView>
  );
}

type PasswordProps = {
  fileName: string;
  bankName?: string | null;
  password: string;
  /** Bank-specific format tip (always shown when known). */
  formatTip: string | null;
  /** Shown after a failed unlock attempt. */
  passwordError: string | null;
  busy: boolean;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  onClose: () => void;
  /** Opens the system file picker so the user can swap the PDF. */
  onChangeFile: () => void;
  /** Leaves this file out and carries on with the others. */
  onSkip?: () => void;
  /** Extra line such as "Statement 2 of 3". */
  queueLabel?: string | null;
};

export function StatementPasswordScreen({
  fileName,
  bankName,
  password,
  formatTip,
  passwordError,
  busy,
  onPasswordChange,
  onUnlock,
  onClose,
  onChangeFile,
  onSkip,
  queueLabel,
}: PasswordProps) {
  const palette = usePalette();
  const canUnlock = password.trim().length > 0 && !busy;
  const hasError = Boolean(passwordError);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <Header title="Unlock statement" onBack={onClose} />
        <ScrollView
          className="flex-1 px-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 justify-center pb-4">
            <View className="items-center">
              <Lock color={palette.primary} size={24} strokeWidth={2.2} />
              <Text className="mt-5 text-center text-[24px] font-bold tracking-[-0.4px] text-foreground">
                {hasError ? "Incorrect password" : "Password required"}
              </Text>
              <Text className="mt-2 max-w-[320px] text-center text-[14px] leading-5 text-muted-foreground">
                {bankName
                  ? `Enter the password for your ${bankName} statement PDF.`
                  : "Enter the password for this statement PDF."}
              </Text>

              {queueLabel ? (
                <Text className="mt-2 text-center text-[12px] font-semibold text-primary">
                  {queueLabel}
                </Text>
              ) : null}

              <Pressable
                accessibilityHint="Opens the file picker to choose a different PDF"
                accessibilityLabel={`Selected statement ${fileName}. Tap to change.`}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                className={`mt-5 w-full rounded-2xl bg-input px-3.5 py-3 ${
                  busy ? "opacity-50" : "active:opacity-80"
                }`}
                disabled={busy}
                onPress={onChangeFile}
              >
                <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                  {fileName}
                </Text>
                <Text className="mt-0.5 text-[12px] text-muted-foreground">
                  {bankName ? `${bankName} · Tap to change` : "Tap to change"}
                </Text>
              </Pressable>
            </View>

            <View className="mt-6">
              <PasswordInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                error={passwordError}
                label="PDF password"
                placeholder="Enter the PDF password"
                returnKeyType="go"
                value={password}
                onChangeText={onPasswordChange}
                onSubmitEditing={() => {
                  if (canUnlock) onUnlock();
                }}
              />
              {formatTip ? (
                <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">{formatTip}</Text>
              ) : null}
            </View>
          </View>
        </ScrollView>

        <View className="gap-2 px-5 pb-2">
          <Button disabled={!canUnlock} loading={busy} onPress={onUnlock}>
            Unlock and continue
          </Button>
          {onSkip ? (
            <Button disabled={busy} variant="ghost" onPress={onSkip}>
              Skip this statement
            </Button>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type CompleteProps = {
  summary: QueueSummary;
  rows: ReadonlyArray<QueueStatusRow>;
  /** Statements saved but insights still need to finish. */
  insightsNotice?: string | null;
  insightsBusy?: boolean;
  /** Plain help for an account mismatch, shown with the problem list. */
  mismatchHint?: string | null;
  onRetryInsights?: () => void;
  /** Leave the flow. Only offered when something was saved. */
  onDone: () => void;
  onAddAnother: () => void;
  onClose: () => void;
};

export function StatementImportComplete({
  summary,
  rows,
  insightsNotice,
  insightsBusy,
  mismatchHint,
  onRetryInsights,
  onDone,
  onAddAnother,
  onClose,
}: CompleteProps) {
  const palette = usePalette();
  const savedAny = summary.saved > 0;
  const lines = queueSummaryLines(summary);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="flex-row justify-end px-5 pt-1">
        <IconButton accessibilityLabel="Close" variant="ghost" onPress={onClose}>
          <X color={palette.foreground} size={22} strokeWidth={2} />
        </IconButton>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center pt-4">
          <View
            className={`h-20 w-20 items-center justify-center rounded-full ${
              savedAny ? "bg-primary/15" : "bg-destructive/10"
            }`}
          >
            {savedAny ? (
              <Check color={palette.primary} size={36} strokeWidth={2.6} />
            ) : (
              <AlertCircle color={palette.destructive} size={36} strokeWidth={2.2} />
            )}
          </View>
          <Text className="mt-6 text-center text-[26px] font-bold text-foreground">
            {queueSummaryHeadline(summary)}
          </Text>
          <View className="mt-2 gap-1">
            {lines.map((line) => (
              <Text
                key={line}
                className="text-center text-[14px] leading-5 text-muted-foreground"
              >
                {line}
              </Text>
            ))}
          </View>
        </View>

        {rows.length > 0 ? (
          <View className="mt-5">
            <QueueStatusList rows={rows} />
          </View>
        ) : null}

        {mismatchHint ? (
          <View className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3">
            <Text className="text-[13px] leading-5 text-destructive">{mismatchHint}</Text>
          </View>
        ) : null}

        {insightsNotice ? (
          <View className="mt-4 rounded-2xl bg-primary/10 px-4 py-3">
            <Text className="text-center text-[13px] leading-5 text-foreground">
              {insightsNotice}
            </Text>
            {onRetryInsights ? (
              <Button className="mt-3" loading={insightsBusy} onPress={onRetryInsights}>
                Try again
              </Button>
            ) : null}
          </View>
        ) : null}

        <View className="mt-5">
          <CoverageNotes />
        </View>
      </ScrollView>
      <View className="gap-3 px-5 pb-2 pt-3">
        <Button onPress={onAddAnother}>
          {savedAny ? ADD_ANOTHER_STATEMENT_LABEL : "Try another statement"}
        </Button>
        {savedAny ? (
          <Button variant="outline" onPress={onDone}>
            {DONE_LABEL}
          </Button>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
