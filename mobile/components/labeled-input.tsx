import React from "react";
import { View, TextInput, TextInputProps } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";

type LabeledInputProps = Omit<
  TextInputProps,
  "style" | "placeholderTextColor"
> & {
  label: string;
  hint?: string;
};

export function LabeledInput({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  onBlur,
  ...rest
}: LabeledInputProps) {
  const { theme } = useTheme();

  return (
    <View className="mb-4">
      <ThemedText type="small" className="text-text mb-1">
        {label}
      </ThemedText>
      {hint ? (
        <ThemedText type="small" className="text-text-muted mb-1">
          {hint}
        </ThemedText>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        onBlur={onBlur}
        className="border border-border rounded-xl px-3 py-2 bg-bg-card text-text"
        style={{ borderColor: theme.backgroundTertiary, color: theme.text, backgroundColor: theme.backgroundDefault }}
        {...rest}
      />
    </View>
  );
}
