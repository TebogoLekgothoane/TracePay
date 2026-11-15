import { router } from "expo-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { ReviewIcon, ReviewStatus } from "../../features/leaks/potential-leaks";
import type { ReviewStep, ReviewTransaction } from "../../features/leaks/potential-leaks";
import { COLORS } from "../../theme/colors";
import { TransactionListIcon } from "../transactions/TransactionListIcon";
import { BrandLogo } from "../ui/BrandLogo";
import { Button } from "../ui/Button";
import {
  DocumentActionsMenu,
  type DocumentActionsMenuAction,
} from "../ui/DocumentActionsMenu";
import { ScreenHeader } from "../ui/ScreenHeader";
import { resolveMarkColor } from "./LeakFlowShell";

const TABS = ["Overview", "Guidance"] as const;
type ReviewTab = (typeof TABS)[number];

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
  const [tab, setTab] = useState<ReviewTab>("Overview");
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

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
          title=""
          onBack={() => router.back()}
          right={
            menuActions.length > 0 ? (
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

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
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
          {props.nextCharge ? (
            <View className="mt-5 rounded-2xl bg-muted px-4 py-3.5">
              <Text className="text-[14px] text-muted-foreground">Next charge</Text>
              <Text className="mt-0.5 text-[18px] font-semibold text-foreground">{props.nextCharge}</Text>
            </View>
          ) : null}

          <View className="mt-8 flex-row border-b border-border">
            {TABS.map((item) => {
              const selected = item === tab;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setTab(item)}
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

          {tab === "Overview" ? (
            <View className="mt-6">
              <Text className="text-[22px] font-bold tracking-[-0.3px] text-foreground">Why this was flagged</Text>
              {props.known.length === 0 ? (
                <Text className="mt-2 text-[16px] leading-6 text-muted-foreground">{props.why}</Text>
              ) : null}
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
              <KnownBlock known={props.known} uncertain={props.uncertain} />
              <TransactionList
                transactions={props.transactions}
                onPress={props.onTransactionPress}
              />
              <CorrectionNotice />
            </View>
          ) : null}

          {tab === "Guidance" ? (
            <View className="mt-6">
              {props.guidanceExtra}
              {props.steps.length > 0 ? (
                <View className="mt-6">
                  <StepList steps={props.steps} />
                </View>
              ) : null}
              {props.onOpenGuide ? (
                <Button className="mt-5" variant="outline" onPress={props.onOpenGuide}>
                  Open the full fix guide
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
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

  if (item.description) {
    return (
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={`${item.title}, ${item.amount}`}
        disabled={!onPress}
        onPress={() => onPress?.(item.id)}
        className="flex-row items-center gap-3.5 rounded-3xl bg-card px-4 py-3.5 active:opacity-70"
      >
        <TransactionListIcon
          description={item.description}
          category={null}
          type={item.direction ?? null}
          size={40}
        />
        <View className="min-w-0 flex-1 pr-2">
          <Text className="text-[16px] font-semibold leading-5 text-foreground" numberOfLines={1}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text className="mt-1 text-[13px] leading-4 text-muted-foreground" numberOfLines={1}>
              {item.subtitle}
            </Text>
          ) : null}
        </View>
        <Text
          className={`min-w-[88px] text-right text-[16px] font-bold leading-5 ${
            item.direction === "credit" ? "text-green-600" : "text-foreground"
          }`}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {item.amount}
        </Text>
      </Pressable>
    );
  }

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
            {[...new Set(known)].map((line) => (
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

/** Shown on every finding: the engine reads statements automatically and can be wrong. */
function CorrectionNotice() {
  return (
    <View className="mt-6 rounded-3xl border border-border bg-card px-4 py-4">
      <Text className="text-[15px] font-semibold text-foreground">Check this against your statement</Text>
      <Text className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
        TracePay reads your statement automatically. It can misread a row, miss context such as a
        refund or a reversal, or flag something that is correct. Check the amounts and transactions
        above.
      </Text>
    </View>
  );
}
