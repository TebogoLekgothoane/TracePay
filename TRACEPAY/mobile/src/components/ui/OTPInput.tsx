import { useCallback, useEffect, useRef } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  length?: number;
  value: string;
  editable?: boolean;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
};

export function OTPInput({
  length = 6,
  value,
  editable = true,
  onChange,
  onComplete,
}: Props) {
  const digits = value.replace(/\D/g, "").slice(0, length);
  const inputRef = useRef<TextInput>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (digits.length < length) {
      completedRef.current = false;
    }
  }, [digits.length, length]);

  const handleChange = useCallback(
    (nextValue: string) => {
      if (!editable) {
        return;
      }

      const next = nextValue.replace(/\D/g, "").slice(0, length);
      onChange(next);

      if (next.length === length && !completedRef.current) {
        completedRef.current = true;
        onComplete?.(next);
      }
    },
    [editable, length, onChange, onComplete],
  );

  return (
    <Pressable
      accessibilityRole="none"
      onPress={() => {
        if (editable) {
          inputRef.current?.focus();
        }
      }}
    >
      <View className="flex-row justify-between gap-2" pointerEvents="none">
        {Array.from({ length }, (_, index) => {
          const focused = digits.length === index || (digits.length === length && index === length - 1);

          return (
            <View
              key={index}
              className={`h-14 flex-1 items-center justify-center rounded-2xl border bg-input ${
                focused ? "border-primary" : "border-input-border"
              }`}
            >
              <Text className="text-center text-[22px] font-semibold text-foreground">
                {digits[index] ?? ""}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        autoFocus
        caretHidden
        contextMenuHidden
        editable={editable}
        keyboardType="number-pad"
        maxLength={length}
        onChangeText={handleChange}
        textContentType="oneTimeCode"
        value={digits}
        className="absolute h-px w-px opacity-[0.01]"
      />
    </Pressable>
  );
}
