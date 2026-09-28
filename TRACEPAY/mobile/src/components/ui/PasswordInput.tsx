import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

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
  autoComplete?: "password" | "new-password" | "off";
  returnKeyType?: "done" | "next" | "go" | "search" | "send";
  maxLength?: number;
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
        <BridgedTextField
          {...props}
          editable={editable}
          hostStyle={{ height: 52 }}
          inputStyle={{
            height: 52,
            paddingHorizontal: 0,
            paddingRight: 8,
            backgroundColor: "transparent",
            borderWidth: 0,
          }}
          secureTextEntry={!visible}
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
