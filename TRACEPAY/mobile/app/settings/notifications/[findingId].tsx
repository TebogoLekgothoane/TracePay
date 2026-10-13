import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BridgedTextField } from "../../../src/components/ui/BridgedTextField";
import { Button } from "../../../src/components/ui/Button";
import { IconButton } from "../../../src/components/ui/IconButton";
import {
  ACTION_LABELS,
  ACTION_TYPES,
  OUTCOME_LABELS,
  sanitiseActionNote,
  type ActionType,
} from "../../../src/features/guidance/finding-guidance.model";
import { useFindingGuidance } from "../../../src/hooks/useFindingGuidance";
import { COLORS } from "../../../src/theme/colors";

function formatActionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function FindingGuidanceScreen() {
  const { findingId } = useLocalSearchParams<{ findingId: string }>();
  const id = typeof findingId === "string" ? findingId : "";
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { guidance, loading, saving, error, retry, record } = useFindingGuidance(id);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [pending, setPending] = useState<ActionType | null>(null);

  async function onRecord(actionType: ActionType) {
    if (saving || pending) {
      return;
    }
    let cleaned: string | null;
    try {
      cleaned = sanitiseActionNote(note);
    } catch (caught) {
      setNoteError(caught instanceof Error ? caught.message : "The note cannot be saved.");
      return;
    }
    setNoteError(null);
    setPending(actionType);
    try {
      const saved = await record(actionType, cleaned);
      if (saved) {
        setNote("");
      }
    } finally {
      setPending(null);
    }
  }

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
            <View className="flex-1">
              <Text className="text-[24px] font-bold text-foreground">
                {guidance?.title ?? "Finding"}
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                {guidance
                  ? `Detection status: ${guidance.detectionStatusLabel}`
                  : "Guidance for this finding"}
              </Text>
            </View>
          </View>

          {loading ? (
            <View className="mt-10 items-center">
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : null}

          {error ? (
            <View className="mt-6 rounded-2xl bg-card px-4 py-4">
              <Text className="text-[15px] text-foreground">{error}</Text>
              <Button className="mt-3" variant="outline" onPress={() => void retry()}>
                Try again
              </Button>
            </View>
          ) : null}

          {guidance ? (
            <View className="mt-5 gap-3">
              <Section title="Your response">
                <Text className="text-[15px] text-foreground">
                  {guidance.userResponse
                    ? ACTION_LABELS[guidance.userResponse]
                    : "No response recorded"}
                </Text>
              </Section>

              {guidance.source ? (
                <Section title="Source">
                  <Text className="text-[15px] leading-5 text-foreground">{guidance.source}</Text>
                </Section>
              ) : null}

              <Section title="What happened">
                <Text className="text-[15px] leading-5 text-foreground">
                  {guidance.whatHappened}
                </Text>
              </Section>

              <Section title="Why it was flagged">
                <Text className="text-[15px] leading-5 text-foreground">{guidance.reason}</Text>
              </Section>

              <Section title="Transactions involved">
                {guidance.evidence.length === 0 ? (
                  <Text className="text-[15px] leading-5 text-muted-foreground">
                    No extra transaction evidence is safe to show.
                  </Text>
                ) : (
                  guidance.evidence.map((item) => (
                    <Text
                      key={`${item.label}-${item.value}`}
                      className="text-[15px] leading-5 text-foreground"
                    >
                      {item.label}: {item.value}
                    </Text>
                  ))
                )}
              </Section>

              <Section title="What is known">
                {guidance.known.map((line) => (
                  <Text key={line} className="text-[15px] leading-5 text-foreground">
                    {line}
                  </Text>
                ))}
              </Section>

              <Section title="What is uncertain">
                {guidance.uncertain.map((line) => (
                  <Text key={line} className="text-[15px] leading-5 text-foreground">
                    {line}
                  </Text>
                ))}
              </Section>

              <Section title="Outcome checks">
                {guidance.outcomeChecks.length === 0 ? (
                  <Text className="text-[15px] leading-5 text-muted-foreground">
                    No later statement has been compared with this finding.
                  </Text>
                ) : (
                  guidance.outcomeChecks.map((check) => (
                    <View key={check.id} className="mt-2">
                      <Text className="text-[15px] font-semibold text-foreground">
                        {OUTCOME_LABELS[check.outcome]}
                      </Text>
                      <Text className="text-[13px] text-muted-foreground">
                        {formatActionDate(check.checkedAt)}
                      </Text>
                      <Text className="mt-1 text-[14px] leading-5 text-foreground">
                        {check.basis}
                      </Text>
                    </View>
                  ))
                )}
              </Section>

              <Section title="What to do next">
                {guidance.steps.map((step) => (
                  <Text key={step} className="text-[15px] leading-5 text-foreground">
                    {step}
                  </Text>
                ))}
              </Section>

              <Section title="Recorded responses">
                {guidance.actions.length === 0 ? (
                  <Text className="text-[15px] leading-5 text-muted-foreground">
                    No response has been recorded.
                  </Text>
                ) : (
                  guidance.actions.map((action) => (
                    <View key={action.id} className="mt-2">
                      <Text className="text-[15px] font-semibold text-foreground">
                        {ACTION_LABELS[action.actionType]}
                      </Text>
                      <Text className="text-[13px] text-muted-foreground">
                        {formatActionDate(action.createdAt)}
                      </Text>
                      {action.note ? (
                        <Text className="mt-1 text-[14px] leading-5 text-foreground">
                          {action.note}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </Section>

              <View className="rounded-2xl bg-card px-4 py-4">
                <Text className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Record a response
                </Text>
                <View className="mt-3">
                  <BridgedTextField
                    value={note}
                    onChangeText={setNote}
                    placeholder="Optional note"
                    maxLength={280}
                    multiline
                    editable={!saving}
                    autoCapitalize="sentences"
                    inputStyle={{ minHeight: 72, textAlignVertical: "top" }}
                  />
                </View>
                {noteError ? (
                  <Text className="mt-2 text-[13px] text-destructive">{noteError}</Text>
                ) : null}
                <View className="mt-3 gap-2">
                  {ACTION_TYPES.map((actionType) => (
                    <Button
                      key={actionType}
                      variant="secondary"
                      size="md"
                      loading={pending === actionType}
                      disabled={saving}
                      onPress={() => void onRecord(actionType)}
                    >
                      {ACTION_LABELS[actionType]}
                    </Button>
                  ))}
                </View>
                <Text className="mt-3 text-[13px] leading-5 text-muted-foreground">
                  Recording a response does not mark this finding resolved or claim money was
                  saved.
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="rounded-2xl bg-card px-4 py-4">
      <Text className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </Text>
      <View className="mt-2 gap-1">{children}</View>
    </View>
  );
}
