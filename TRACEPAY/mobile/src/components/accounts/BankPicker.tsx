import { Check, ChevronDown } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  SA_INSTITUTIONS,
  type SaInstitution,
} from "../../features/accounts/account.constants";
import { COLORS } from "../../theme/colors";

type Props = {
  value: SaInstitution | null;
  onChange: (bank: SaInstitution) => void;
  error?: string | null;
  disabled?: boolean;
};

export function BankPicker({ value, onChange, error, disabled }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Text className="mb-2 text-[13px] font-semibold text-foreground">Bank</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose bank"
        className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-80"
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        <Text
          className={`text-[15px] ${value ? "font-semibold text-foreground" : "text-muted-foreground"}`}
        >
          {value ?? "Select your bank"}
        </Text>
        <ChevronDown color={palette.mutedForeground} size={18} strokeWidth={2.2} />
      </Pressable>
      {error ? (
        <Text className="mt-2 text-[12px] text-destructive">{error}</Text>
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        transparent
        visible={open}
      >
        <Pressable
          accessibilityRole="button"
          className="flex-1 justify-end"
          onPress={() => setOpen(false)}
          style={{ backgroundColor: "rgba(15, 10, 30, 0.45)" }}
        >
          <Pressable
            className="rounded-t-3xl bg-background"
            onPress={(event) => event.stopPropagation()}
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <View className="items-center pt-3">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </View>
            <Text className="px-5 pb-3 pt-4 text-[18px] font-bold text-foreground">
              Choose your bank
            </Text>
            <ScrollView
              className="max-h-[420px]"
              keyboardShouldPersistTaps="handled"
            >
              {SA_INSTITUTIONS.map((bank) => {
                const selected = value === bank;
                return (
                  <Pressable
                    key={bank}
                    className="flex-row items-center justify-between border-t border-border px-5 py-4 active:opacity-80"
                    onPress={() => {
                      onChange(bank);
                      setOpen(false);
                    }}
                  >
                    <Text
                      className={`text-[15px] ${selected ? "font-semibold text-primary" : "text-foreground"}`}
                    >
                      {bank}
                    </Text>
                    {selected ? (
                      <Check color={palette.primary} size={18} strokeWidth={2.4} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
