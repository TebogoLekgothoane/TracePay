import { router } from "expo-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Eye,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ACTION_LABELS,
  type ActionType,
} from "../../features/guidance/finding-guidance.model";
import type { ReviewIcon, ReviewStatus } from "../../features/leaks/potential-leaks";
import type { ReviewStep, ReviewTransaction } from "../../features/leaks/potential-leaks";
import type { StoredLeakResponse } from "../../features/leaks/leak-response.store";
import { COLORS, withAlpha } from "../../theme/colors";
import { BrandLogo } from "../ui/BrandLogo";
import { BridgedTextField } from "../ui/BridgedTextField";
import { Button } from "../ui/Button";
import {
  DocumentActionsMenu,
  type DocumentActionsMenuAction,
} from "../ui/DocumentActionsMenu";
import { ScreenHeader } from "../ui/ScreenHeader";
import { resolveMarkColor } from "./LeakFlowShell";

const TABS = ["Overview", "Guidance"] as const;
type ReviewTab = (typeof TABS)[number];
type Phase = "detail" | "steps" | "response";

const RESPONSES: { action: ActionType; detail: string; Icon: LucideIcon }[] = [
  { action: "reviewed", detail: "I've looked at this finding.", Icon: Eye },
  { action: "steps_completed", detail: "I've taken the recommended steps.", Icon: CheckCircle2 },
  { action: "dismissed", detail: "This isn't an issue.", Icon: X },
  { action: "not_applicable", detail: "This doesn't apply to me.", Icon: Ban },
];

const NOTE_LIMIT = 280;

export type FindingReviewProps = {
  title: string;
  amount: string;
  subtitle: string;
  status: ReviewStatus;
  icon: ReviewIcon;
  why: string;
  evidence: { label: string; value: string }[];
  transactions: ReviewTransaction[];
  steps: ReviewStep[];
  known: string[];
  uncertain: string[];
  history: { title: string; detail: string }[];
  nextCharge: string;
  response: StoredLeakResponse | null;
  saving?: boolean;
  saveError?: string | null;
  onSave: (action: ActionType, note: string) => Promise<boolean>;
  onTransactionPress?: (id: string) => void;
  onOpenGuide?: () => void;
  historyExtra?: ReactNode;
  guidanceExtra?: ReactNode;
  /** Native kebab menu actions (iOS + Android). */
  menuActions?: DocumentActionsMenuAction[];
  /** @deprecated Prefer `menuActions`. Kept for single-action callers. */
  onInfo?: () => void;
};

export function FindingReview(props: FindingReviewProps) {
  const [phase, setPhase] = useState<Phase>("detail");
  const [tab, setTab] = useState<ReviewTab>("Overview");
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

  const back = () => {
    if (phase === "response") {
      setPhase("steps");
      return;
    }
    if (phase === "steps") {
      setPhase("detail");
      return;
    }
    router.back();
  };

  const menuActions = useMemo((): DocumentActionsMenuAction[] => {
    if (props.menuActions && props.menuActions.length > 0) {
      return props.menuActions;
    }
    if (props.onInfo) {
      return [
        {
          action: "info",
          label: "How we calculate",
          callback: props.onInfo,
        },
      ];
    }
    return [];
  }, [props.menuActions, props.onInfo]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 pt-1">
        <ScreenHeader
          title={
            phase === "detail" ? "" : phase === "steps" ? "Next steps" : "Record your response"
          }
          onBack={back}
          right={
            phase === "detail" && menuActions.length > 0 ? (
              <DocumentActionsMenu
                actions={menuActions}
                foregroundColor={palette.foreground}
                mutedColor={palette.mutedForeground}
                size={40}
              />
            ) : undefined
          }
        />
      </View>

      {phase === "detail" ? (
        <DetailPhase
          {...props}
          tab={tab}
          onTab={setTab}
          bottomInset={insets.bottom}
          onReview={() => setPhase("steps")}
        />
      ) : null}
      {phase === "steps" ? (
        <StepsPhase
          steps={props.steps}
          known={props.known}
          uncertain={props.uncertain}
          bottomInset={insets.bottom}
          onOpenGuide={props.onOpenGuide}
          onContinue={() => setPhase("response")}
        />
      ) : null}
      {phase === "response" ? (
        <ResponsePhase
          response={props.response}
          saving={props.saving}
          saveError={props.saveError}
          bottomInset={insets.bottom}
          onSave={props.onSave}
          onSaved={() => setPhase("detail")}
        />
      ) : null}
    </SafeAreaView>
  );
}

function DetailPhase(
  props: FindingReviewProps & {
    tab: ReviewTab;
    onTab: (tab: ReviewTab) => void;
    bottomInset: number;
    onReview: () => void;
  },
) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: props.bottomInset + 96 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5">
          <Text
            accessibilityRole="header"
            className="mt-5 text-[30px] font-bold leading-[36px] tracking-[-0.6px] text-foreground"
          >
            {props.title}
          </Text>
          <Text className="mt-3 text-[46px] font-bold leading-[52px] tracking-[-1.2px] text-foreground">
            {props.amount}
          </Text>
          <Text className="mt-1 text-[16px] leading-6 text-muted-foreground">{props.subtitle}</Text>
          <View className="mt-5 rounded-2xl bg-muted px-4 py-3.5">
            <Text className="text-[14px] text-muted-foreground">Next charge</Text>
            <Text className="mt-0.5 text-[18px] font-semibold text-foreground">{props.nextCharge}</Text>
          </View>

          <View className="mt-8 flex-row border-b border-border">
            {TABS.map((item) => {
              const selected = item === props.tab;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => props.onTab(item)}
                  className="flex-1 items-center justify-end px-1.5 pb-3"
                  style={{ minHeight: 44 }}
                >
                  <Text
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    numberOfLines={1}
                    className={`text-[15px] ${selected ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}
                    style={{ width: "100%", textAlign: "center" }}
                  >
                    {item}
                  </Text>
                  <View
                    className="absolute bottom-0 h-[3px] rounded-full"
                    style={{
                      left: 0,
                      right: 0,
                      backgroundColor: selected ? palette.primary : "transparent",
                    }}
                  />
                </Pressable>
              );
            })}
          </View>

          {props.tab === "Overview" ? (
            <View className="mt-6">
              <Text className="text-[22px] font-bold tracking-[-0.3px] text-foreground">Why this was flagged</Text>
              <Text className="mt-2 text-[16px] leading-6 text-muted-foreground">{props.why}</Text>
              {props.evidence.length > 0 ? (
                <View className="mt-5 flex-row rounded-3xl border border-border bg-card py-4">
                  {props.evidence.map((item, index) => (
                    <View
                      key={item.label}
                      className={`flex-1 px-5 ${index > 0 ? "border-l border-border" : ""}`}
                    >
                      <Text className="text-[14px] text-muted-foreground">{item.label}</Text>
                      <Text className="mt-1 text-[18px] font-semibold text-foreground">
                        {item.value}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <TransactionList
                transactions={props.transactions}
                onPress={props.onTransactionPress}
              />
            </View>
          ) : null}

          {props.tab === "Overview" && props.response ? (
            <View className="mt-4">
              <ResponseSummary response={props.response} />
            </View>
          ) : null}

          {props.tab === "Guidance" ? (
            <View className="mt-6">
              <StepList steps={props.steps} />
              <KnownBlock known={props.known} uncertain={props.uncertain} />
              {props.onOpenGuide ? (
                <Button className="mt-5" variant="outline" onPress={props.onOpenGuide}>
                  Open the full fix guide
                </Button>
              ) : null}
              {props.guidanceExtra}
            </View>
          ) : null}

        </View>
      </ScrollView>
      <Footer inset={props.bottomInset}>
        <Button onPress={props.onReview} style={{ borderRadius: 20 }}>
          Review and take action
        </Button>
      </Footer>
    </>
  );
}

function StepsPhase({
  steps,
  known,
  uncertain,
  bottomInset,
  onOpenGuide,
  onContinue,
}: {
  steps: ReviewStep[];
  known: string[];
  uncertain: string[];
  bottomInset: number;
  onOpenGuide?: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottomInset + 96 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-2">
          <Text className="mt-2 text-[15px] text-muted-foreground">
            Here&apos;s what you can do about this.
          </Text>
          <View className="mt-6">
            <StepList steps={steps} />
          </View>
          <View className="mt-6">
            <KnownBlock known={known} uncertain={uncertain} />
          </View>
          {onOpenGuide ? (
            <Button className="mt-5" variant="outline" onPress={onOpenGuide}>
              Open the full fix guide
            </Button>
          ) : null}
        </View>
      </ScrollView>
      <Footer inset={bottomInset}>
        <Button onPress={onContinue}>Review and take action</Button>
      </Footer>
    </>
  );
}

function ResponsePhase({
  response,
  saving,
  saveError,
  bottomInset,
  onSave,
  onSaved,
}: {
  response: StoredLeakResponse | null;
  saving?: boolean;
  saveError?: string | null;
  bottomInset: number;
  onSave: (action: ActionType, note: string) => Promise<boolean>;
  onSaved: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [selected, setSelected] = useState<ActionType | null>(response?.action ?? null);
  const [note, setNote] = useState(response?.note ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    if (!selected || saving) return;
    setLocalError(null);
    const saved = await onSave(selected, note);
    if (saved) onSaved();
  };

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottomInset + 96 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-2">
          <Text className="mt-2 text-[15px] leading-6 text-muted-foreground">
            This helps you keep track of what you&apos;ve done. It doesn&apos;t mark the finding as
            resolved.
          </Text>
          <View className="mt-6 gap-3">
            {RESPONSES.map((item) => {
              const active = selected === item.action;
              return (
                <Pressable
                  key={item.action}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSelected(item.action)}
                  className="flex-row items-center gap-3 rounded-3xl bg-card px-4 py-4 active:opacity-80"
                >
                  <View
                    className="h-10 w-10 items-center justify-center rounded-full"
                  >
                    <item.Icon color={palette.foreground} size={18} strokeWidth={2.2} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-semibold text-foreground">
                      {ACTION_LABELS[item.action]}
                    </Text>
                    <Text className="mt-0.5 text-[13px] text-muted-foreground">{item.detail}</Text>
                  </View>
                  <View
                    className="h-6 w-6 items-center justify-center rounded-full border-2"
                    style={{
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active ? palette.primary : "transparent",
                    }}
                  >
                    {active ? <Check color={COLORS.white} size={14} strokeWidth={3} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-2 mt-6 text-[15px] font-semibold text-foreground">
            Add a note (optional)
          </Text>
          <View className="overflow-hidden rounded-2xl bg-card">
            <BridgedTextField
              autoCapitalize="sentences"
              editable={!saving}
              maxLength={NOTE_LIMIT}
              multiline
              placeholder="Add a note (max 280 characters)..."
              value={note}
              onChangeText={setNote}
              inputStyle={{ minHeight: 88, paddingHorizontal: 16, paddingVertical: 12, textAlignVertical: "top" }}
            />
          </View>
          <Text className="mt-2 text-right text-[12px] text-muted-foreground">
            {note.length}/{NOTE_LIMIT}
          </Text>
          {localError || saveError ? (
            <Text className="mt-2 text-[13px] text-destructive">{localError ?? saveError}</Text>
          ) : null}
        </View>
      </ScrollView>
      <Footer inset={bottomInset}>
        <Button disabled={!selected} loading={saving} onPress={() => void submit()}>
          Save response
        </Button>
      </Footer>
    </>
  );
}

function TransactionList({
  transactions,
  onPress,
}: {
  transactions: ReviewTransaction[];
  onPress?: (id: string) => void;
}) {
  if (transactions.length === 0) return null;
  return (
    <View className="mt-6">
      <Text className="mb-3 text-[22px] font-bold tracking-[-0.3px] text-foreground">Transactions</Text>
      <View className="gap-2">
        {transactions.map((item) => (
          <TransactionRow key={item.id} item={item} onPress={onPress} />
        ))}
      </View>
    </View>
  );
}

function TransactionRow({
  item,
  onPress,
}: {
  item: ReviewTransaction;
  onPress?: (id: string) => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const markColor = resolveMarkColor(palette, item.markColor ?? "primary");

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={() => onPress?.(item.id)}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 active:opacity-80"
    >
      {item.logoDomain ? (
        <BrandLogo
          name={item.title}
          logoDomain={item.logoDomain}
          size={40}
          fallbackColor={markColor}
          shape="circle"
        />
      ) : (
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <Text className="text-[14px] font-bold" style={{ color: markColor }}>
            {item.mark ?? item.title.slice(0, 1)}
          </Text>
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text className="text-[18px] font-semibold text-foreground">{item.title}</Text>
        <Text className="mt-0.5 text-[15px] text-muted-foreground">{item.subtitle}</Text>
        {item.nextCharge ? (
          <Text className="mt-1 text-[12px] font-medium text-foreground">
            Next charge {item.nextCharge}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <Text className="text-[18px] font-bold text-foreground">{item.amount}</Text>
        {item.trailing ? (
          <Text className="mt-0.5 text-[12px] text-muted-foreground">{item.trailing}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function StepList({ steps }: { steps: ReviewStep[] }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  const seenUrls = new Set<string>();
  const stepsWithUniqueLinks = steps.map((step) => ({
    ...step,
    links: (step.links ?? []).filter((link) => {
      if (seenUrls.has(link.url)) return false;
      seenUrls.add(link.url);
      return true;
    }),
  }));

  return (
    <View className="gap-3">
      {stepsWithUniqueLinks.map((step, index) => (
        <View key={step.title} className="flex-row gap-3 rounded-3xl bg-card px-4 py-4">
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: palette.foreground }}
          >
            <Text className="text-[13px] font-bold" style={{ color: palette.background }}>
              {index + 1}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-semibold text-foreground">{step.title}</Text>
            <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">{step.detail}</Text>
            {step.links && step.links.length > 0 ? (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {step.links.map((link) => (
                  <Pressable
                    key={link.label}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${link.label}`}
                    onPress={() => {
                      void Linking.openURL(link.url).catch(() => undefined);
                    }}
                    className="py-1 active:opacity-60"
                  >
                    <Text
                      className="text-[13px] font-semibold"
                      style={{ textDecorationLine: "underline", color: "#FDBA74" }}
                    >
                      Open {link.label} ↗
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function KnownBlock({ known, uncertain }: { known: string[]; uncertain: string[] }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="mt-6 gap-5">
      {known.length > 0 ? (
        <View>
          <Text className="text-[17px] font-bold text-foreground">What we know</Text>
          <View className="mt-3 gap-3">
            {known.map((line) => (
              <View key={line} className="flex-row items-start gap-3">
                <CheckCircle2 color={palette.success} size={18} strokeWidth={2.2} />
                <Text className="flex-1 text-[14px] leading-5 text-foreground">{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {uncertain.length > 0 ? (
        <View>
          <Text className="text-[17px] font-bold text-foreground">What&apos;s uncertain</Text>
          <View className="mt-3 gap-3">
            {uncertain.map((line) => (
              <View key={line} className="flex-row items-start gap-3">
                <AlertCircle color={palette.warning} size={18} strokeWidth={2.2} />
                <Text className="flex-1 text-[14px] leading-5 text-foreground">{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ResponseSummary({ response }: { response: StoredLeakResponse | null }) {
  if (!response) {
    return (
      <View className="rounded-3xl bg-card px-4 py-4">
        <Text className="text-[15px] font-semibold text-foreground">Your response</Text>
        <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
          No response recorded yet. Recording one does not mark this finding resolved.
        </Text>
      </View>
    );
  }
  const date = new Date(response.savedAt);
  const when = Number.isNaN(date.getTime())
    ? "Saved"
    : date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  return (
    <View className="rounded-2xl bg-muted px-4 py-4">
      <Text className="text-[18px] font-bold text-foreground">Your response</Text>
      <Text className="mt-1 text-[16px] text-foreground">{ACTION_LABELS[response.action]}</Text>
      <Text className="mt-0.5 text-[15px] text-muted-foreground">{when}</Text>
      {response.note ? (
        <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">{response.note}</Text>
      ) : null}
    </View>
  );
}

function Footer({ inset, children }: { inset: number; children: ReactNode }) {
  return (
    <View className="px-5 pt-3" style={{ paddingBottom: Math.max(inset, 16) }}>
      {children}
    </View>
  );
}
