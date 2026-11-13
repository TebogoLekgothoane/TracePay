import { ChevronRight, Search, X } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  INSTITUTION_COLORS,
  STATEMENT_IMPORT_BANKS,
  resolveInstitutionLogoDomain,
  type SaInstitution,
} from "../../features/accounts/account.constants";
import { COVERAGE_OPTIONAL_MESSAGE } from "../../features/statement-import/statement-import.messages";
import { COLORS } from "../../theme/colors";
import { BridgedTextField } from "../ui/BridgedTextField";
import { InstitutionLogo } from "./InstitutionLogo";

type Props = {
  selected?: SaInstitution | null;
  disabled?: boolean;
  onSelect: (bank: SaInstitution) => void;
};

function brandColor(institution: SaInstitution, fallback: string): string {
  return INSTITUTION_COLORS[institution.toLowerCase()] ?? fallback;
}

export function BankImportList({
  selected = null,
  disabled = false,
  onSelect,
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return STATEMENT_IMPORT_BANKS;
    return STATEMENT_IMPORT_BANKS.filter((bank) => bank.name.toLowerCase().includes(needle));
  }, [query]);

  const searching = query.trim().length > 0;

  return (
    <View>
      <Text className="text-[26px] font-bold tracking-[-0.5px] text-foreground">
        Choose a bank
      </Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
        Select the bank, then upload one or more statement PDFs. {COVERAGE_OPTIONAL_MESSAGE}
      </Text>

      <View className="mt-5 flex-row items-center rounded-2xl bg-input px-3.5">
        <Search color={palette.mutedForeground} size={18} strokeWidth={2} />
        <View className="ml-2.5 min-h-12 flex-1 justify-center overflow-hidden">
          <BridgedTextField
            autoCapitalize="words"
            autoCorrect={false}
            editable={!disabled}
            hostStyle={{ height: 48 }}
            inputStyle={{
              height: 48,
              paddingHorizontal: 0,
              backgroundColor: "transparent",
              borderWidth: 0,
            }}
            placeholder="Search banks"
            returnKeyType="search"
            value={query}
            onChangeText={setQuery}
          />
        </View>
        {searching ? (
          <Pressable
            accessibilityLabel="Clear search"
            accessibilityRole="button"
            className="h-8 w-8 items-center justify-center rounded-full bg-muted active:opacity-80"
            hitSlop={8}
            onPress={() => setQuery("")}
          >
            <X color={palette.mutedForeground} size={14} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>

      <Text className="mb-3 mt-6 text-[12px] font-bold uppercase tracking-[1.1px] text-muted-foreground">
        {searching ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}` : "Supported banks"}
      </Text>

      {filtered.length === 0 ? (
        <View className="items-center rounded-3xl px-6 py-10">
          <Text className="text-[15px] font-semibold text-foreground">No bank matched</Text>
          <Text className="mt-1 text-center text-[13px] text-muted-foreground">
            Try another name, or clear search to browse the full list.
          </Text>
        </View>
      ) : (
        <View className="overflow-hidden rounded-3xl bg-card">
          {filtered.map((bank, index) => {
            const color = brandColor(bank.name, palette.primary);
            const isSelected = selected === bank.name;
            const isLast = index === filtered.length - 1;
            const rowDisabled = disabled;

            return (
              <Pressable
                key={bank.name}
                accessibilityHint={bank.hint}
                accessibilityLabel={`Import ${bank.name} statement`}
                accessibilityRole="button"
                accessibilityState={{ disabled: rowDisabled, selected: isSelected }}
                className={`flex-row items-center px-4 py-3.5 active:opacity-80 ${
                  isSelected ? "bg-primary/10" : "bg-transparent"
                } ${isLast ? "" : "border-b border-border"} ${rowDisabled ? "opacity-50" : ""}`}
                disabled={rowDisabled}
                onPress={() => onSelect(bank.name)}
              >
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-muted">
                  <InstitutionLogo
                    color={color}
                    logoDomain={resolveInstitutionLogoDomain(bank.name)}
                    name={bank.name}
                    size={34}
                  />
                </View>
                <View className="ml-3 min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="text-[16px] font-semibold text-foreground">{bank.name}</Text>
                    <View className="rounded-md bg-muted px-1.5 py-0.5">
                      <Text className="text-[10px] font-bold tracking-[0.4px] text-muted-foreground">
                        PDF
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-0.5 text-[12px] text-muted-foreground" numberOfLines={2}>
                    {bank.hint}
                  </Text>
                </View>
                <View className="ml-1 opacity-50">
                  <ChevronRight color={palette.mutedForeground} size={18} strokeWidth={2} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
