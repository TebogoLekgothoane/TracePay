import { Pressable, Text, View } from "react-native";

import { ACCOUNT_TYPE_LABELS } from "../../features/accounts/account.constants";
import { ACCOUNT_TYPES, type AccountType } from "../../features/accounts/account.types";

type Props = {
  value: AccountType;
  disabled?: boolean;
  onChange: (value: AccountType) => void;
};

export function AccountTypePicker({ value, disabled, onChange }: Props) {
  return (
    <View>
      <Text className="mb-2 text-[13px] font-semibold text-foreground">Account type</Text>
      <View className="flex-row flex-wrap gap-2">
        {ACCOUNT_TYPES.map((type) => {
          const selected = type === value;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(disabled), selected }}
              className={`rounded-full px-3 py-2 ${
                selected ? "bg-primary" : "bg-muted"
              } ${disabled ? "opacity-50" : ""}`}
              disabled={disabled}
              onPress={() => onChange(type)}
            >
              <Text
                className={`text-[13px] font-semibold ${
                  selected ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                {ACCOUNT_TYPE_LABELS[type]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
