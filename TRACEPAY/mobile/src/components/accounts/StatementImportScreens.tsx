import {
  Check,
  ChevronLeft,
  Clock3,
  FileText,
  Hourglass,
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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  estimateExtractionMs,
  formatElapsed,
  type StatementImportStage,
} from "../../features/statement-import/statement-import.progress";
import { COLORS } from "../../theme/colors";
import { BridgedTextField } from "../ui/BridgedTextField";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

const TICK_MS = 400;
const BAR_HEIGHT = 5;
const NODE_SIZE = 28;

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
  const within =
    stage === "extracting" ? Math.min(extractElapsedMs / 40_000, 0.85) : 0.35;
  return Math.min(96, Math.max(8, Math.round(((current + within) / STEPS.length) * 100)));
}

function formatRemainingCompact(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (seconds <= 15) return "Almost done";
  if (seconds < 60) return `~${seconds}s remaining`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes}m remaining`;
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
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {onBack ? (
          <IconButton accessibilityLabel="Go back" variant="ghost" onPress={onBack}>
            <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
          </IconButton>
        ) : null}
      </View>
      <Text className="text-[17px] font-semibold text-foreground" numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSide} />
    </View>
  );
}

function ProgressBar({
  percent,
  tone = "foreground",
}: {
  percent: number;
  tone?: "foreground" | "primary";
}) {
  const palette = usePalette();
  const width = Math.max(0, Math.min(100, percent));
  const fill = tone === "primary" ? palette.primary : palette.foreground;

  return (
    <View style={[styles.progressTrack, { backgroundColor: palette.muted, height: BAR_HEIGHT }]}>
      <View
        style={{
          height: BAR_HEIGHT,
          width: `${width}%`,
          borderRadius: BAR_HEIGHT,
          backgroundColor: fill,
        }}
      />
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
    <View
      style={[
        styles.docCard,
        {
          backgroundColor: palette.card,
          borderColor: palette.border,
          shadowColor: palette.foreground,
        },
      ]}
    >
      <View style={styles.docHeader}>
        <FileText color={palette.foreground} size={16} strokeWidth={2.2} />
        <Text
          className="ml-2 text-[11px] font-bold uppercase tracking-[0.7px] text-foreground"
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <View style={styles.docBody}>
        {[78, 92, 64, 86, 70, 54].map((width) => (
          <View
            key={width}
            style={[styles.docLine, { width: `${width}%`, backgroundColor: palette.muted }]}
          />
        ))}
      </View>
      <View style={styles.docProgress}>
        <ProgressBar percent={percent} />
      </View>
    </View>
  );
}

function ConnectedStepper({ current }: { current: number }) {
  const palette = usePalette();

  return (
    <View>
      <View style={styles.stepRow}>
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const Icon = step.Icon;
          const reached = done || active;

          return (
            <View key={step.title} style={styles.stepCol}>
              <View style={styles.stepNodeRow}>
                {index > 0 ? (
                  <View
                    style={[
                      styles.stepLine,
                      {
                        borderColor: index <= current ? palette.foreground : palette.border,
                        borderStyle: index <= current ? "solid" : "dashed",
                      },
                    ]}
                  />
                ) : (
                  <View style={styles.stepLineSpacer} />
                )}
                <View
                  style={[
                    styles.stepNode,
                    {
                      backgroundColor: done ? palette.foreground : palette.card,
                      borderColor: reached ? palette.foreground : palette.border,
                      borderStyle: active && !done ? "dashed" : "solid",
                    },
                  ]}
                >
                  {done ? (
                    <Check color={palette.background} size={14} strokeWidth={3} />
                  ) : (
                    <Icon
                      color={active ? palette.foreground : palette.mutedForeground}
                      size={14}
                      strokeWidth={2.2}
                    />
                  )}
                </View>
                {index < STEPS.length - 1 ? (
                  <View
                    style={[
                      styles.stepLine,
                      {
                        borderColor: index < current ? palette.foreground : palette.border,
                        borderStyle: index < current ? "solid" : "dashed",
                      },
                    ]}
                  />
                ) : (
                  <View style={styles.stepLineSpacer} />
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
    </View>
  );
}

type ProcessingProps = {
  stage: StatementImportStage;
  fileSizeBytes?: number | null;
  bankName?: string | null;
  onClose?: () => void;
};

export function StatementProcessingScreen({
  stage,
  fileSizeBytes,
  bankName,
  onClose,
}: ProcessingProps) {
  const palette = usePalette();
  const { elapsedMs, extractElapsedMs } = useImportClock(stage);
  const current = stepIndex(stage, extractElapsedMs);
  const percent = progressPercent(stage, extractElapsedMs);
  const remainingMs = Math.max(estimateExtractionMs(fileSizeBytes) - extractElapsedMs, 0);
  const step = STEPS[current];
  const detail = step.detail(bankName ?? null);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <Header title="Tracing statement" onBack={onClose} />

      <ScrollView
        contentContainerStyle={styles.processingScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <DocumentCard bankName={bankName} percent={percent} />

          <Text className="mt-6 text-[44px] font-bold tracking-[-1.2px] text-foreground">
            {percent}%
          </Text>
          <Text className="mt-1 text-[17px] font-semibold text-foreground">{step.headline}</Text>
          <Text className="mt-2 max-w-[300px] text-center text-[14px] leading-5 text-muted-foreground">
            {detail}
          </Text>

          <View className="mt-4 flex-row items-center justify-center gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
              <Clock3 color={palette.mutedForeground} size={13} strokeWidth={2.2} />
              <Text className="text-[12px] font-semibold text-muted-foreground">
                {formatElapsed(elapsedMs)}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
              <Hourglass color={palette.mutedForeground} size={13} strokeWidth={2.2} />
              <Text className="text-[12px] font-semibold text-muted-foreground">
                {formatRemainingCompact(remainingMs)}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.footerCard,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              shadowColor: palette.foreground,
            },
          ]}
        >
          <ConnectedStepper current={current} />

          <View className="mt-5 flex-row items-center gap-3">
            <View className="flex-1">
              <ProgressBar percent={percent} />
            </View>
            <Text className="text-[12px] font-bold text-foreground">{percent}%</Text>
          </View>

          <View className="mt-4 flex-row items-center justify-center gap-1.5">
            <ShieldCheck color={palette.mutedForeground} size={13} strokeWidth={2.2} />
            <Text className="text-[12px] text-muted-foreground">
              Your financial data stays private.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type PasswordProps = {
  fileName: string;
  bankName?: string | null;
  password: string;
  passwordHint: string | null;
  busy: boolean;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  onClose: () => void;
  onChooseAnother: () => void;
};

export function StatementPasswordScreen({
  fileName,
  bankName,
  password,
  passwordHint,
  busy,
  onPasswordChange,
  onUnlock,
  onClose,
  onChooseAnother,
}: PasswordProps) {
  const palette = usePalette();
  const canUnlock = password.trim().length > 0 && !busy;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <Header title="Unlock statement" onBack={onClose} />
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={styles.passwordScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center">
            <View className="h-20 w-20 items-center justify-center rounded-[24px] border border-border bg-card">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
                <Lock color={palette.primary} size={24} strokeWidth={2.2} />
              </View>
            </View>
            <Text className="mt-5 text-center text-[24px] font-bold tracking-[-0.4px] text-foreground">
              Password required
            </Text>
            <Text className="mt-2 max-w-[320px] text-center text-[14px] leading-5 text-muted-foreground">
              {bankName
                ? `Enter the password for your ${bankName} statement PDF.`
                : "Enter the password for this statement PDF."}
            </Text>

            <View className="mt-5 w-full flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <FileText color={palette.primary} size={18} strokeWidth={2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                  {fileName}
                </Text>
                {bankName ? (
                  <Text className="mt-0.5 text-[12px] text-muted-foreground">{bankName}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <View className="mt-6">
            <Text className="mb-2 text-[13px] font-semibold text-foreground">PDF password</Text>
            <View className="overflow-hidden rounded-2xl border border-input-border bg-input">
              <BridgedTextField
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                hostStyle={{ height: 52 }}
                inputStyle={{
                  height: 52,
                  paddingHorizontal: 16,
                  backgroundColor: "transparent",
                  borderWidth: 0,
                }}
                placeholder="Enter the PDF password"
                returnKeyType="go"
                secureTextEntry
                value={password}
                onChangeText={onPasswordChange}
                onSubmitEditing={() => {
                  if (canUnlock) onUnlock();
                }}
              />
            </View>
            {passwordHint ? (
              <Text className="mt-2 text-[13px] text-muted-foreground">{passwordHint}</Text>
            ) : null}
          </View>
        </ScrollView>

        <View className="gap-3 px-5 pb-2">
          <Button disabled={!canUnlock} loading={busy} onPress={onUnlock}>
            Unlock and continue
          </Button>
          <Button disabled={busy} variant="outline" onPress={onChooseAnother}>
            Choose another PDF
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type CompleteProps = {
  transactionCount: number;
  newFindings: number;
  updatedFindings: number;
  onClose: () => void;
  onViewInsights: () => void;
  onImportAnother: () => void;
};

export function StatementImportComplete({
  transactionCount,
  newFindings,
  updatedFindings,
  onClose,
  onViewInsights,
  onImportAnother,
}: CompleteProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const countLabel = transactionCount.toLocaleString("en-ZA");

  const rows = [
    { Icon: FileText, label: "New transactions", value: countLabel },
    {
      Icon: Sparkles,
      label: "New findings",
      value: newFindings.toLocaleString("en-ZA"),
    },
    {
      Icon: RefreshCw,
      label: "Updated findings",
      value: updatedFindings.toLocaleString("en-ZA"),
    },
  ] as const;

  return (
    <View
      className="flex-1 bg-background px-5"
      style={{ paddingBottom: Math.max(insets.bottom, 16) }}
    >
      <View className="flex-row justify-end pt-1">
        <IconButton accessibilityLabel="Close" variant="ghost" onPress={onClose}>
          <X color={palette.foreground} size={22} strokeWidth={2} />
        </IconButton>
      </View>
      <View className="flex-1 items-center justify-center">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-primary/15">
          <Check color={palette.primary} size={36} strokeWidth={2.6} />
        </View>
        <Text className="mt-6 text-[28px] font-bold text-foreground">Import complete</Text>
        <Text className="mt-2 text-center text-[15px] leading-6 text-muted-foreground">
          We&apos;ve added {countLabel} transaction{transactionCount === 1 ? "" : "s"} from your
          statement.
        </Text>
        <View className="mt-6 w-full rounded-3xl border border-border bg-card">
          {rows.map((row, index) => (
            <View key={row.label}>
              {index > 0 ? <View className="mx-4 h-px bg-border" /> : null}
              <View className="flex-row items-center gap-3 px-4 py-4">
                <row.Icon color={palette.primary} size={18} strokeWidth={2} />
                <Text className="flex-1 text-[15px] text-foreground">{row.label}</Text>
                <Text className="text-[16px] font-bold text-foreground">{row.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <View className="gap-3">
        <Button onPress={onViewInsights}>View your insights</Button>
        <Button variant="outline" onPress={onImportAnother}>
          Import another statement
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSide: {
    width: 44,
    position: "absolute",
    left: 12,
    zIndex: 1,
  },
  processingScroll: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 8,
  },
  hero: {
    alignItems: "center",
    paddingTop: 8,
  },
  docCard: {
    width: 220,
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  docHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  docBody: {
    gap: 9,
    marginBottom: 16,
  },
  docLine: {
    height: 8,
    borderRadius: 999,
  },
  docProgress: {
    marginTop: 2,
  },
  footerCard: {
    marginTop: 28,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 16,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepCol: {
    flex: 1,
    alignItems: "center",
  },
  stepNodeRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  stepNode: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: {
    flex: 1,
    borderTopWidth: 1.5,
  },
  stepLineSpacer: {
    flex: 1,
  },
  progressTrack: {
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  passwordScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 16,
  },
});
