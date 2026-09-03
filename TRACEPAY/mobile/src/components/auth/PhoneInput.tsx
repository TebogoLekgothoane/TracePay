import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { Text, TextInput, View, type TextInputProps } from "react-native";

import { COLORS } from "../../theme/colors";

type Props = Omit<TextInputProps, "keyboardType"> & {
  label?: string;
  error?: string | null;
};

export function PhoneInput({
  label = "SA phone number",
  error,
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
        <Ionicons
          color={palette.placeholder}
          name="call-outline"
          size={18}
          style={{ marginLeft: 16, marginRight: 10 }}
        />
        <Text className="mr-2 text-[16px] font-medium text-muted-foreground">
          +27
        </Text>
        <TextInput
          accessibilityLabel={label}
          editable={editable}
          keyboardType="phone-pad"
          placeholder="72 123 4567"
          placeholderTextColor={palette.placeholder}
          textContentType="telephoneNumber"
          className="h-[52px] flex-1 pr-4 text-[16px] text-foreground"
          {...props}
        />
      </View>
      {hasError ? (
        <Text className="text-[12px] text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}
