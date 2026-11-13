import { ChevronDown } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { RHYTHM_SPANS, type RhythmSpan } from "../../features/dashboard/spending-rhythm";
import { COLORS } from "../../theme/colors";
import { SelectionSheet } from "../ui/Modal";

type Props = {
  span: RhythmSpan;
  onSpanChange: (span: RhythmSpan) => void;
};

/** Non-iOS fallback: a pill that opens the shared selection sheet. */
export function RhythmSpanMenu({ span, onSpanChange }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose how many months to show"
        className="flex-row items-center gap-1 rounded-full bg-card px-3 py-1.5 active:opacity-75"
        onPress={() => setOpen(true)}
      >
        <Text className="text-[12px] font-medium text-foreground">{span}</Text>
        <ChevronDown color={palette.mutedForeground} size={14} strokeWidth={2} />
      </Pressable>
      <SelectionSheet
        visible={open}
        title="Show spending for"
        selected={span}
        onSelect={onSpanChange}
        onClose={() => setOpen(false)}
        options={RHYTHM_SPANS.map((value) => ({ value, label: value }))}
      />
    </>
  );
}
