import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, Eye, EyeOff, Upload } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { TRACEPAY } from "../../theme/colors";
import { InstitutionLogo } from "../accounts/InstitutionLogo";
import { Button } from "../ui/Button";
import type { AccountPreview } from "./AccountsCard";

type Props = {
  balance: string;
  metaLabel: string;
  accounts: AccountPreview[];
  hidden?: boolean;
  onToggleVisibility?: () => void;
  onImportStatement?: () => void;
  onViewAccounts?: () => void;
};

const MAX_CHIPS = 3;

function BalanceAmount({ balance, hidden }: { balance: string; hidden: boolean }) {
  if (hidden) {
    return (
      <Text className="text-[38px] font-bold tracking-[-1px] text-white">R ••••••</Text>
    );
  }

  const match = balance.match(/^(R\s?[\d,]+)([.,][\d]+)?$/);
  if (!match) {
    return (
      <Text className="text-[34px] font-bold tracking-[-1px] text-white">{balance}</Text>
    );
  }

  return (
    <Text className="font-bold tracking-[-1px] text-white">
      <Text className="text-[38px]">{match[1]}</Text>
      {match[2] ? <Text className="text-[24px] text-white/80">{match[2]}</Text> : null}
    </Text>
  );
}

/** Overlapping bank logos for the connected accounts, with a "+N" for the rest. */
function AccountChips({ accounts }: { accounts: AccountPreview[] }) {
  const shown = accounts.slice(0, MAX_CHIPS);
  const extra = accounts.length - shown.length;
  return (
    <View className="flex-row items-center">
      {shown.map((account, index) => (
        <View
          key={account.id}
          className="rounded-full border-2"
          style={{
            marginLeft: index === 0 ? 0 : -10,
            borderColor: TRACEPAY.light.summaryGradient[1],
          }}
        >
          <InstitutionLogo
            name={account.name}
            logoDomain={account.logoDomain}
            color={account.color}
            size={34}
          />
        </View>
      ))}
      {extra > 0 ? (
        <View
          className="h-[38px] w-[38px] items-center justify-center rounded-full border-2 bg-white/15"
          style={{ marginLeft: -10, borderColor: TRACEPAY.light.summaryGradient[1] }}
        >
          <Text className="text-[12px] font-semibold text-white">+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function BalanceCard({
  balance,
  metaLabel,
  accounts,
  hidden = false,
  onToggleVisibility,
  onImportStatement,
  onViewAccounts,
}: Props) {
  const heading =
    accounts.length > 0
      ? `Total balance (${accounts.length} ${accounts.length === 1 ? "account" : "accounts"})`
      : "Total balance";

  return (
    <LinearGradient
      colors={[...TRACEPAY.light.summaryGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 20,
        overflow: "hidden",
      }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-medium text-white/70">{heading}</Text>
          <View className="mt-1.5">
            <BalanceAmount balance={balance} hidden={hidden} />
          </View>
          <Text className="mt-1.5 text-[12px] leading-5 text-white/60" numberOfLines={2}>
            {metaLabel}
          </Text>
        </View>

        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import a statement"
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10 active:opacity-70"
            onPress={onImportStatement}
          >
            <Upload color="rgba(255,255,255,0.85)" size={17} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show balances" : "Hide balances"}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10 active:opacity-70"
            onPress={onToggleVisibility}
          >
            {hidden ? (
              <EyeOff color="rgba(255,255,255,0.85)" size={18} strokeWidth={2} />
            ) : (
              <Eye color="rgba(255,255,255,0.85)" size={18} strokeWidth={2} />
            )}
          </Pressable>
        </View>
      </View>

      <View className="mt-5 flex-row items-center justify-between gap-3">
        {accounts.length > 0 ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View accounts"
              className="h-11 flex-row items-center gap-2 rounded-full border border-white/20 bg-white/15 px-5 active:opacity-80"
              onPress={onViewAccounts}
            >
              <Text className="text-[14px] font-semibold text-white">View accounts</Text>
              <ArrowRight color="#FFFFFF" size={16} strokeWidth={2.2} />
            </Pressable>
            <AccountChips accounts={accounts} />
          </>
        ) : (
          <Button className="flex-1" size="md" onPress={onImportStatement}>
            <>
              <Upload color="#FFFFFF" size={17} strokeWidth={2.2} />
              <Text className="text-[14px] font-semibold text-white">Add a statement</Text>
            </>
          </Button>
        )}
      </View>
    </LinearGradient>
  );
}
