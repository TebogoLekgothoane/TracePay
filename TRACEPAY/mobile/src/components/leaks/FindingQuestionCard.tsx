import { HelpCircle } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { FindingQuestion } from "../../features/leak-intelligence/leak-intelligence.types";

type Props = {
  question: FindingQuestion;
  /** Resolves when the answer is saved. A rejection is shown on the card. */
  onAnswer: (question: FindingQuestion, answer: string) => Promise<void>;
  onSkip: (question: FindingQuestion) => Promise<void>;
};

/**
 * One question about one finding. It says why it is asking, offers "Not sure",
 * and can always be skipped, so it never feels like a form to fill in.
 */
export function FindingQuestionCard({ question, onAnswer, onSkip }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      // On success the parent reloads and this card is replaced, so busy stays on.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your answer.");
      setBusy(false);
    }
  };

  return (
    <View className="rounded-3xl bg-card px-5 py-5">
      <View className="flex-row items-center gap-2">
        <HelpCircle size={16} strokeWidth={2.2} color="#6B7280" />
        <Text className="text-[12px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
          Quick question
        </Text>
      </View>
      <Text className="mt-2 text-[16px] font-bold leading-[22px] text-foreground">
        {question.prompt}
      </Text>
      {question.context.map((line) => (
        <Text key={line} className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
          {line}
        </Text>
      ))}
      <Text className="mt-2 text-[12px] leading-4 text-muted-foreground">{question.why_asked}</Text>

      <View className="mt-4 flex-row flex-wrap gap-2">
        {question.options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            className="rounded-full border border-border px-4 py-2 active:opacity-70"
            onPress={() => run(() => onAnswer(question, option.value))}
          >
            <Text className="text-[13px] font-semibold text-foreground">{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        {question.can_skip ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip this question"
            disabled={busy}
            hitSlop={8}
            onPress={() => run(() => onSkip(question))}
          >
            <Text className="text-[13px] font-semibold text-muted-foreground">Skip</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {busy && !error ? <ActivityIndicator size="small" /> : null}
      </View>
      {error ? <Text className="mt-2 text-[12px] text-destructive">{error}</Text> : null}
    </View>
  );
}
