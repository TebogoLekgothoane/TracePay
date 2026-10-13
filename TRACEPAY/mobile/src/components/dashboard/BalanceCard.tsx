import { LinearGradient } from "expo-linear-gradient";
import { BarChart3, Eye, EyeOff, Upload } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { TRACEPAY } from "../../theme/colors";
import { Button } from "../ui/Button";

type Props = {
  balance: string;
  metaLabel: string;
  hidden?: boolean;
  onToggleVisibility?: () => void;
  onImportStatement?: () => void;
  onViewInsights?: () => void;
};

function BalanceAmount({ balance, hidden }: { balance: string; hidden: boolean }) {
  if (hidden) {
    return (
      <Text className="text-[36px] font-bold tracking-[-1px] text-white">
        R ••••••
      </Text>
    );
  }

  const match = balance.match(/^(R\s?[\d,]+)([.,][\d]+)?$/);
  if (!match) {
    return (
      <Text className="text-[36px] font-bold tracking-[-1px] text-white">
        {balance}
      </Text>
    );
  }

  return (
    <Text className="font-bold tracking-[-1px] text-white">
      <Text className="text-[36px]">{match[1]}</Text>
      {match[2] ? <Text className="text-[22px] text-white/80">{match[2]}</Text> : null}
    </Text>
  );
}

export function BalanceCard({
  balance,
  metaLabel,
  hidden = false,
  onToggleVisibility,
  onImportStatement,
  onViewInsights,
}: Props) {
  return (
    <LinearGradient
      colors={[...TRACEPAY.light.summaryGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 18,
        overflow: "hidden",
      }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-medium text-white/65">Total balance</Text>
          <View className="mt-1.5">
            <BalanceAmount balance={balance} hidden={hidden} />
          </View>
          <Text className="mt-1.5 text-[12px] leading-5 text-white/55" numberOfLines={2}>
            {metaLabel}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? "Show balances" : "Hide balances"}
          hitSlop={10}
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

      <View className="mt-5 flex-row gap-2.5">
        <Button className="flex-1" size="md" onPress={onImportStatement}>
          <>
            <Upload color="#FFFFFF" size={17} strokeWidth={2.2} />
            <Text className="text-[14px] font-semibold text-white">Import statement</Text>
          </>
        </Button>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View insights"
          className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-full border border-white/20 bg-white/12 active:opacity-80"
          onPress={onViewInsights}
        >
          <BarChart3 color="#FFFFFF" size={17} strokeWidth={2.2} />
          <Text className="text-[14px] font-semibold text-white">Insights</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
