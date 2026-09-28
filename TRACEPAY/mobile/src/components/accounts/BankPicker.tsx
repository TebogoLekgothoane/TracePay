import { ChevronDown } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  SA_INSTITUTIONS,
  type SaInstitution,
} from "../../features/accounts/account.constants";
import { COLORS } from "../../theme/colors";
import { SelectionSheet } from "../ui/Modal";

type Props = {
  value: SaInstitution | null;
  onChange: (bank: SaInstitution) => void;
  error?: string | null;
  disabled?: boolean;
};

export function BankPicker({ value, onChange, error, disabled }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Text className="mb-2 text-[13px] font-semibold text-foreground">Bank</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        className={`h-[52px] flex-row items-center justify-between rounded-2xl border bg-card px-4 ${
          error ? "border-destructive" : "border-border"
        } ${disabled ? "opacity-50" : ""}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        <Text
          className={`text-[16px] ${
            value ? "font-medium text-foreground" : "text-muted-foreground"
          }`}
        >
          {value ?? "Select your bank"}
        </Text>
        <ChevronDown color={palette.mutedForeground} size={18} />
      </Pressable>
      {error ? (
        <Text className="mt-2 text-[12px] text-destructive">{error}</Text>
      ) : null}
      <SelectionSheet
        options={SA_INSTITUTIONS.map((bank) => ({
          value: bank,
          label: bank,
        }))}
        selected={value}
        title="Select your bank"
        visible={open}
        onClose={() => setOpen(false)}
        onSelect={(bank) => {
          onChange(bank);
          setOpen(false);
        }}
      />
    </View>
  );
}
