import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { Text, TextInput, View, type TextInputProps } from "react-native";

import { COLORS } from "../../theme/colors";

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function Input({
  label,
  error,
  icon,
  className = "",
  editable = true,
  ...props
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const hasError = Boolean(error);

  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-foreground">{label}</Text>
      <View
        className={`h-[52px] flex-row items-center rounded-2xl border bg-input ${
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
          className={`h-[52px] flex-1 text-[16px] text-foreground ${
            icon ? "pr-4" : "px-4"
          } ${className}`}
          {...props}
        />
      </View>
      {hasError ? (
        <Text className="text-[12px] text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}
