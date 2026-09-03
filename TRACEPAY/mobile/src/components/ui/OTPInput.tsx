import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputKeyPressEventData,
  type NativeSyntheticEvent,
} from "react-native";

type Props = {
  length?: number;
  value: string;
  editable?: boolean;
  onChange: (value: string) => void;
};

export function OTPInput({
  length = 6,
  value,
  editable = true,
  onChange,
}: Props) {
  const digits = value.replace(/\D/g, "").slice(0, length);
  const refs = useRef<Array<TextInput | null>>([]);

  const handleChange = useCallback(
    (index: number, raw: string) => {
      const nextDigit = raw.replace(/\D/g, "").slice(-1);
      const chars = digits.split("");
      chars[index] = nextDigit;
      const next = chars.join("").slice(0, length);
      onChange(next);

      if (nextDigit && index < length - 1) {
        refs.current[index + 1]?.focus();
      }
    },
    [digits, length, onChange],
  );

  const handleKeyPress = useCallback(
    (index: number, event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (event.nativeEvent.key !== "Backspace" || digits[index]) {
        return;
      }

      if (index > 0) {
        refs.current[index - 1]?.focus();
        onChange(digits.slice(0, index - 1));
      }
    },
    [digits, onChange],
  );

  return (
    <View className="flex-row justify-between gap-2">
      {Array.from({ length }, (_, index) => (
        <TextInput
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          accessibilityLabel={`Digit ${index + 1}`}
          className="h-14 flex-1 rounded-2xl border border-input-border bg-input text-center text-[22px] font-semibold text-foreground"
          editable={editable}
          keyboardType="number-pad"
          maxLength={1}
          onChangeText={(text) => handleChange(index, text)}
          onKeyPress={(event) => handleKeyPress(index, event)}
          value={digits[index] ?? ""}
        />
      ))}
    </View>
  );
}
