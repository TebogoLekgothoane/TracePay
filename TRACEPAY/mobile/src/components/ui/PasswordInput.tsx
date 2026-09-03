import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";

import { COLORS } from "../../theme/colors";

type Props = Omit<TextInputProps, "secureTextEntry"> & {
  label: string;
  error?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function PasswordInput({
  label,
  error,
  icon = "lock-closed-outline",
  editable = true,
  ...props
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [visible, setVisible] = useState(false);
  const hasError = Boolean(error);

  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-foreground">{label}</Text>
      <View
        className={`h-[52px] flex-row items-center rounded-2xl border bg-input pr-2 ${
          hasError ? "border-destructive" : "border-input-border"
        } ${editable ? "" : "opacity-50"}`}
      >
        {icon ? (
          <Ionicons
            color={palette.placeholder}
            name={icon}
            size={18}
            style={{ marginLeft: 16, marginRight: 10 }}
          />
        ) : null}
        <TextInput
          accessibilityLabel={label}
          editable={editable}
          placeholderTextColor={palette.placeholder}
          secureTextEntry={!visible}
          className={`h-[52px] flex-1 text-[16px] text-foreground ${
            icon ? "pr-4" : "px-4"
          }`}
          {...props}
        />
        <Pressable
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          accessibilityRole="button"
          disabled={!editable}
          hitSlop={8}
          onPress={() => setVisible((current) => !current)}
          className="h-10 w-10 items-center justify-center"
        >
          <Ionicons
            name={visible ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={palette.mutedForeground}
          />
        </Pressable>
      </View>
      {hasError ? (
        <Text className="text-[12px] text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}
