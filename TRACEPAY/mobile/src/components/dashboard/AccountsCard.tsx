import { ChevronRight, Plus } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import { COLORS } from "../../theme/colors";
import { InstitutionLogo } from "../accounts/InstitutionLogo";
import { Button } from "../ui/Button";

export type AccountPreview = {
  id: string;
  name: string;
  masked: string;
  balance: string;
  color: string;
  logoDomain: string | null;
};

type Props = {
  accounts: AccountPreview[];
  onAddAccount?: () => void;
  onSeeDetails?: () => void;
  onAccountPress?: (account: AccountPreview) => void;
  loading?: boolean;
  hideBalances?: boolean;
};

export function AccountsCard({
  accounts,
  onAddAccount,
  onSeeDetails,
  onAccountPress,
  loading = false,
  hideBalances = false,
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-foreground">
          Your accounts
        </Text>
        <Button onPress={onSeeDetails} size="sm" variant="ghost" className="px-0">
          See all
        </Button>
      </View>

      {loading && accounts.length === 0 ? (
        <View className="rounded-2xl border border-border/60 bg-card px-4 py-6">
          <Text className="text-[14px] text-muted-foreground">
            Loading your accounts…
          </Text>
        </View>
      ) : null}

      {!loading && accounts.length === 0 ? (
        <View className="rounded-2xl border border-border/60 bg-card px-4 py-6">
          <Text className="text-[14px] leading-6 text-muted-foreground">
            Add your bank accounts manually for now. TracePay will analyse all of
            them together once transactions are connected.
          </Text>
        </View>
      ) : null}

      <View className="gap-2.5">
        {accounts.map((account) => (
          <Pressable
            key={account.id}
            onPress={() => onAccountPress?.(account)}
            className="flex-row items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3.5 active:opacity-70"
          >
            <InstitutionLogo
              name={account.name}
              logoDomain={account.logoDomain}
              color={account.color}
            />
            <View className="min-w-0 flex-1">
              <Text
                className="text-[15px] font-semibold text-foreground"
                numberOfLines={1}
              >
                {account.name}
              </Text>
              <Text
                className="mt-0.5 text-[12px] text-muted-foreground"
                numberOfLines={1}
              >
                {account.masked}
              </Text>
            </View>
            <Text className="text-[15px] font-bold text-foreground">
              {hideBalances ? "R ••••••" : account.balance}
            </Text>
            <ChevronRight
              color={palette.mutedForeground}
              size={18}
              strokeWidth={2}
            />
          </Pressable>
        ))}
      </View>

      <Button
        className="mt-3 border-dashed border-primary/50"
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
