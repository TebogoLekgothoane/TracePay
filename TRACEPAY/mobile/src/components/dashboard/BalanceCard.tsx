import { LinearGradient } from "expo-linear-gradient";
import { BarChart3, Eye, Landmark } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import TracePayIcon from "../../../assets/icons/assembled TracePay icon.svg";
import { Button } from "../ui/Button";

type Props = {
  balance: string;
  changeLabel: string;
  hidden?: boolean;
  onToggleVisibility?: () => void;
  onAddAccount?: () => void;
  onViewInsights?: () => void;
};

function BalanceAmount({ balance, hidden }: { balance: string; hidden: boolean }) {
  if (hidden) {
    return (
      <Text className="text-[34px] font-bold tracking-[-1px] text-white">
        R ••••••
      </Text>
    );
  }

  const match = balance.match(/^(R\s?[\d,]+)(\.[\d]+)?$/);
  if (!match) {
    return (
      <Text className="text-[34px] font-bold tracking-[-1px] text-white">
        {balance}
      </Text>
    );
  }

  return (
    <Text className="font-bold tracking-[-1px] text-white">
      <Text className="text-[34px]">{match[1]}</Text>
      {match[2] ? (
        <Text className="text-[22px]">{match[2]}</Text>
      ) : null}
    </Text>
  );
}

export function BalanceCard({
  balance,
  changeLabel,
  hidden = false,
  onToggleVisibility,
  onAddAccount,
  onViewInsights,
}: Props) {
  return (
    <LinearGradient
      colors={["#241845", "#161028", "#0F0A1C"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        padding: 20,
        overflow: "hidden",
      }}
    >
      <View className="absolute -right-2 top-6 opacity-50" pointerEvents="none">
        <Svg width={160} height={120} viewBox="0 0 160 120">
          <Path
            d="M0 60 C30 20 60 80 90 40 C110 20 130 50 160 30"
            stroke="#A78BFA"
            strokeWidth={3}
            fill="none"
            opacity={0.6}
          />
          <Path
            d="M0 80 C40 50 70 100 110 70 C130 55 145 75 160 60"
            stroke="#7C3AED"
            strokeWidth={2.5}
            fill="none"
            opacity={0.4}
          />
          <Path
            d="M0 95 C35 70 75 110 120 85 C140 72 150 90 160 78"
            stroke="#C084FC"
            strokeWidth={2}
            fill="none"
            opacity={0.35}
          />
        </Svg>
      </View>

      <View className="flex-row items-start justify-between">
        <Pressable
          onPress={onToggleVisibility}
          className="flex-row items-center gap-2 active:opacity-70"
        >
          <Text className="text-[14px] text-white/75">Total balance</Text>
          <Eye color="rgba(255,255,255,0.75)" size={16} strokeWidth={2} />
        </Pressable>
        <TracePayIcon width={44} height={34} />
      </View>

      <View className="mt-3">
        <BalanceAmount balance={balance} hidden={hidden} />
      </View>

      <View className="mt-2.5 self-start rounded-full bg-emerald-500/15 px-3 py-1.5">
        <Text className="text-[12px] font-semibold text-emerald-400">
          {changeLabel}
        </Text>
      </View>

      <View className="mt-5 flex-row gap-3">
        <Button className="flex-1" size="md" onPress={onAddAccount}>
          <>
            <Landmark color="#FFFFFF" size={18} strokeWidth={2} />
            <Text className="text-[14px] font-semibold text-white">
              Add Account
            </Text>
          </>
        </Button>

        <Button
          className="flex-1 border-white/20 bg-white/5"
          size="md"
          variant="secondary"
          onPress={onViewInsights}
        >
          <>
            <BarChart3 color="#FFFFFF" size={18} strokeWidth={2} />
            <Text className="text-[14px] font-semibold text-white/90">
              View Insights
            </Text>
          </>
        </Button>
      </View>
    </LinearGradient>
  );
}
