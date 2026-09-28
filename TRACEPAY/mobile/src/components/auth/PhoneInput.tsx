import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import { COLORS } from "../../theme/colors";
import { BridgedTextField } from "../ui/BridgedTextField";

type Props = {
  label?: string;
  error?: string | null;
  value?: string;
  defaultValue?: string;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  autoComplete?: "tel" | "off";
  maxLength?: number;
};

export function PhoneInput({
  label = "SA phone number",
  error,
  editable = true,
  placeholder,
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
        <BridgedTextField
          {...props}
          autoComplete="tel"
          editable={editable}
          hostStyle={{ height: 52 }}
          inputStyle={{
            height: 52,
            paddingHorizontal: 0,
            paddingRight: 16,
            backgroundColor: "transparent",
            borderWidth: 0,
          }}
          keyboardType="phone-pad"
          placeholder={placeholder ?? "72 123 4567"}
        />
      </View>
      {hasError ? (
        <Text className="text-[12px] text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}
