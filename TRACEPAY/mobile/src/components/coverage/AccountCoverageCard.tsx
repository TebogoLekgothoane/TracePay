import { router } from "expo-router";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import {
  accountSetupHref,
} from "../../features/accounts/account.navigation";
import {
  accountCoverageTone,
  actionableGaps,
  formatCoverageRange,
  gapHeadline,
} from "../../features/statement-coverage/statement-coverage.format";
import type {
  AccountCoverage,
  CoverageGap,
  CoverageIssue,
  CoverageStatement,
} from "../../features/statement-coverage/statement-coverage.types";
import { COLORS } from "../../theme/colors";
import { Button } from "../ui/Button";

const UNASSIGNED_ID = "unassigned";

type Props = {
  account: AccountCoverage;
  statements: CoverageStatement[];
};

const TONE_TEXT = {
  complete: "Covered",
  partial: "Check periods",
  empty: "No statements yet",
} as const;

export function AccountCoverageCard({ account, statements }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const tone = accountCoverageTone(account);
  const toneColor =
    tone === "complete" ? palette.success : tone === "partial" ? palette.warning : palette.placeholder;
  const ToneIcon = tone === "complete" ? CheckCircle2 : tone === "partial" ? AlertTriangle : Info;
  const fileNames = new Map(statements.map((statement) => [statement.id, statement.fileName]));
  const visibleGaps = account.gaps;
  const hasActionable = actionableGaps(account).length > 0;
  const canAdd = account.accountId !== UNASSIGNED_ID;

  return (
    <View
      className="rounded-3xl border border-border bg-card px-4 py-4"
      accessibilityLabel={`${account.label}. ${TONE_TEXT[tone]}`}
    >
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[16px] font-bold text-foreground" numberOfLines={2}>
            {account.label}
          </Text>
          <Text className="mt-0.5 text-[12px] text-muted-foreground">
            {account.statementCount === 0
              ? "Nothing uploaded for this account"
              : `${account.statementCount} statement${account.statementCount === 1 ? "" : "s"}`}
          </Text>
        </View>
        <View className="shrink-0 flex-row items-center gap-1.5">
          <ToneIcon color={toneColor} size={16} strokeWidth={2.2} />
          <Text style={{ color: toneColor }} className="text-[12px] font-semibold">
            {TONE_TEXT[tone]}
          </Text>
        </View>
      </View>

      {!account.hasStatements ? (
        <View className="mt-4 rounded-2xl bg-primary/10 px-3 py-3">
          <Text className="text-[13px] leading-5 text-foreground">
            Adding a statement for this account helps TracePay see more of your money. You can
            add it whenever you like — you do not need every account.
          </Text>
          {canAdd ? (
            <Button
              className="mt-3"
              size="md"
              variant="primary"
              onPress={() => router.push(accountSetupHref(account.accountId) as never)}
            >
              Add a statement
            </Button>
          ) : null}
        </View>
      ) : (
        <>
          <Section title="Covered periods">
            {account.coveredRanges.length === 0 ? (
              <Text className="text-[13px] text-muted-foreground">Dates not available</Text>
            ) : (
              account.coveredRanges.map((range) => (
                <Text
                  key={`${range.start}-${range.end}`}
                  className="text-[14px] font-medium text-foreground"
                >
                  {formatCoverageRange(range.start, range.end)}
                </Text>
              ))
            )}
          </Section>

          <Section title="Statements">
            {account.periods.map((period, index) => {
              const name = fileNames.get(period.statementId);
              return (
                <View key={`${period.statementId}-${index}`} className="mb-1.5">
                  <Text className="text-[13px] text-foreground">
                    {formatCoverageRange(period.start, period.end)} · {period.transactionCount}{" "}
                    transaction{period.transactionCount === 1 ? "" : "s"}
                  </Text>
                  {period.periodSource === "inferred" ? (
                    <Text className="text-[12px] text-muted-foreground">
                      This statement did not print its period, so only the days between its first
                      and last transaction are counted.
                    </Text>
                  ) : null}
                  {name ? (
                    <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
                      {name}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </Section>

          {visibleGaps.length > 0 ? (
            <Section title={hasActionable ? "Gaps" : "Gaps (no action needed)"}>
              {visibleGaps.map((gap, index) => (
                <GapRow key={`${gap.start}-${gap.end}-${index}`} gap={gap} />
              ))}
            </Section>
          ) : null}

          {account.overlaps.length > 0 ? (
            <Section title="Overlaps">
              <Text className="mb-1 text-[12px] text-muted-foreground">
                Overlap is fine — duplicate transactions are never counted twice.
              </Text>
              {account.overlaps.map((overlap, index) => (
                <Text
                  key={`${overlap.start}-${overlap.end}-${index}`}
                  className="text-[13px] text-foreground"
                >
                  {formatCoverageRange(overlap.start, overlap.end)} · {overlap.days} day
                  {overlap.days === 1 ? "" : "s"}
                </Text>
              ))}
            </Section>
          ) : null}

          {account.issues.length > 0 ? (
            <Section title="Statement notes">
              {account.issues.map((issue, index) => (
                <IssueRow
                  key={`${issue.statementId}-${issue.kind}-${index}`}
                  issue={issue}
                  fileName={fileNames.get(issue.statementId) ?? null}
                />
              ))}
            </Section>
          ) : null}

          {canAdd ? (
            <Button
              className="mt-4"
              size="md"
              variant="outline"
              onPress={() => router.push(accountSetupHref(account.accountId) as never)}
            >
              Add another statement
            </Button>
          ) : null}
        </>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-4">
      <Text className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

function GapRow({ gap }: { gap: CoverageGap }) {
  const style =
    gap.kind === "confirmed_missing"
      ? "border-warning/40 bg-warning/10"
      : gap.kind === "balances_continuous"
        ? "border-success/30 bg-success/10"
        : "border-border bg-muted";
  return (
    <View className={`mb-2 rounded-2xl border px-3 py-2.5 ${style}`}>
      <Text className="text-[13px] font-semibold text-foreground">
        {gapHeadline(gap.kind)} · {formatCoverageRange(gap.start, gap.end)}
      </Text>
      {gap.message ? (
        <Text className="mt-0.5 text-[12px] leading-[18px] text-muted-foreground">
          {gap.message}
        </Text>
      ) : null}
    </View>
  );
}

function IssueRow({ issue, fileName }: { issue: CoverageIssue; fileName: string | null }) {
  const style =
    issue.severity === "error"
      ? "border-destructive/40 bg-destructive/10"
      : issue.severity === "warning"
        ? "border-warning/40 bg-warning/10"
        : "border-border bg-muted";
  return (
    <View className={`mb-2 rounded-2xl border px-3 py-2.5 ${style}`}>
      <Text className="text-[12px] leading-[18px] text-foreground">{issue.message}</Text>
      {fileName ? (
        <Text className="mt-0.5 text-[11px] text-muted-foreground" numberOfLines={1}>
          {fileName}
        </Text>
      ) : null}
    </View>
  );
}
