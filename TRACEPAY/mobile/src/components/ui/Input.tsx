import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import { COLORS } from "../../theme/colors";
import { BridgedTextField } from "./BridgedTextField";

type Props = {
  label: string;
  error?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  value?: string;
  defaultValue?: string;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  autoComplete?:
    | "name"
    | "email"
    | "password"
    | "new-password"
    | "tel"
    | "off"
    | "username";
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "number-pad";
  returnKeyType?: "done" | "next" | "go" | "search" | "send";
  maxLength?: number;
};

export function Input({
  label,
  error,
  icon,
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
        <BridgedTextField
          {...props}
          editable={editable}
          hostStyle={{ height: 52 }}
          inputStyle={{
            height: 52,
            paddingHorizontal: icon ? 0 : 16,
            paddingRight: 16,
            backgroundColor: "transparent",
            borderWidth: 0,
          }}
        />
      </View>
      {hasError ? (
        <Text className="text-[12px] text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}
