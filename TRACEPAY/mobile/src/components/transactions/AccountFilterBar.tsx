import { Pressable, ScrollView, Text } from "react-native";

import type { FinancialAccount } from "../../features/accounts/account.types";
import { formatAccountHeading } from "../../features/accounts/account.validation";

type Props = {
  accounts: FinancialAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string | null) => void;
};

export function AccountFilterBar({ accounts, selectedAccountId, onSelect }: Props) {
  if (accounts.length === 0) {
    return null;
  }

  return (
    <ScrollView
      className="mt-4"
      contentContainerStyle={{ gap: 8, paddingRight: 8 }}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      <FilterChip
        label="All Accounts"
        selected={selectedAccountId === null}
        onPress={() => onSelect(null)}
      />
      {accounts.map((account) => (
        <FilterChip
          key={account.id}
          label={formatAccountHeading(account)}
          selected={selectedAccountId === account.id}
          onPress={() => onSelect(account.id)}
        />
      ))}
    </ScrollView>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-full px-3.5 py-2 ${selected ? "bg-primary" : "bg-muted"}`}
      onPress={onPress}
    >
      <Text
        className={`text-[13px] font-semibold ${
          selected ? "text-primary-foreground" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
