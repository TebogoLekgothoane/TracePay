import React from "react";
import { View, Image, ImageSourcePropType } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Bank } from "@/components/bank-card";
import { formatZar, getLossStatus } from "@/components/utils/money";
import { useTheme } from "@/hooks/use-theme-color";
import { Spacing, Colors } from "@/constants/theme";

function getStatusColors(totalLost: number, isDark: boolean) {
  const status = getLossStatus(totalLost);
  const c = isDark ? Colors.dark : Colors.light;
  if (status === "high") return { bg: c.alarmRed + "28", text: c.alarmRed };
  if (status === "medium") return { bg: c.warningYellow + "28", text: c.warningYellow };
  return { bg: c.hopeGreen + "28", text: c.hopeGreen };
}

export function BankSummaryCard({ bank, logo }: { bank: Bank; logo?: ImageSourcePropType }) {
  const { theme, isDark } = useTheme();
  const statusColors = getStatusColors(bank.totalLost, isDark);
  const statusLabel = getLossStatus(bank.totalLost);

  return (
    <View
      style={{
        width: "100%",
        borderRadius: 18,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.lg,
        backgroundColor: theme.backgroundSecondary,
        borderWidth: 1,
        borderColor: theme.backgroundTertiary,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          {logo ? (
            <Image
              source={logo}
              style={{ width: 44, height: 44, borderRadius: 10, marginRight: Spacing.md }}
              resizeMode="contain"
            />
          ) : null}
          <ThemedText type="h2" style={{ color: theme.text, flex: 1, fontSize: 20 }}>
            {bank.name}
          </ThemedText>
        </View>
        <View
          style={{
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.xs,
            borderRadius: 9999,
            backgroundColor: statusColors.bg,
          }}
        >
          <ThemedText
            type="body"
            style={{
              color: statusColors.text,
              fontSize: 14,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            {statusLabel}
          </ThemedText>
        </View>
      </View>
      <ThemedText
        type="body"
        style={{
          color: theme.textSecondary,
          marginTop: Spacing.md,
          fontSize: 16,
          lineHeight: 22,
        }}
      >
        You lost {formatZar(bank.totalLost)} this month
      </ThemedText>
    </View>
  );
}

