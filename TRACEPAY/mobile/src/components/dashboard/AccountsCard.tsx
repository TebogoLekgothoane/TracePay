import { Building2, ChevronRight, Diamond, Plus } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import { COLORS } from "../../theme/colors";
import { Button } from "../ui/Button";

export type AccountPreview = {
  id: string;
  name: string;
  masked: string;
  balance: string;
  color: string;
  kind: "bank" | "wallet" | "nedbank";
};

type Props = {
  accounts: AccountPreview[];
  onAddAccount?: () => void;
  onSeeDetails?: () => void;
};

function AccountIcon({
  account,
}: {
  account: AccountPreview;
}) {
  if (account.kind === "nedbank") {
    return <Diamond color={account.color} size={20} strokeWidth={2.2} fill={account.color} />;
  }

  if (account.kind === "wallet") {
    return (
      <Text className="text-[15px] font-bold" style={{ color: account.color }}>
        M
      </Text>
    );
  }

  return <Building2 color={account.color} size={20} strokeWidth={2.2} />;
}

export function AccountsCard({
  accounts,
  onAddAccount,
  onSeeDetails,
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View
      className="overflow-hidden rounded-3xl bg-card"
      style={{
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <View className="flex-row items-center justify-between px-4 pb-1 pt-4">
        <Text className="text-[17px] font-bold text-foreground">
          Your accounts
        </Text>
        <Button onPress={onSeeDetails} size="sm" variant="ghost" className="px-0">
          See details
        </Button>
      </View>

      {accounts.map((account, index) => (
        <Pressable
          key={account.id}
          className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-70 ${
            index < accounts.length - 1 ? "border-b border-border/40" : ""
          }`}
        >
          <View
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: `${account.color}22` }}
          >
            <AccountIcon account={account} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-foreground">
              {account.name}
            </Text>
            <Text className="mt-0.5 text-[12px] text-muted-foreground">
              {account.masked}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-[15px] font-bold text-foreground">
              {account.balance}
            </Text>
            <Text className="mt-0.5 text-[11px] text-muted-foreground">
              Current balance
            </Text>
          </View>
          <ChevronRight
            color={palette.mutedForeground}
            size={18}
            strokeWidth={2}
          />
        </Pressable>
      ))}

      <Button
        className="mx-4 mb-4 mt-2 border-dashed border-primary/50"
        size="md"
        variant="secondary"
        onPress={onAddAccount}
      >
        <>
          <Plus color={palette.primary} size={18} strokeWidth={2.4} />
          <Text className="text-[14px] font-semibold text-primary">
            Add another account
          </Text>
        </>
      </Button>
    </View>
  );
}
