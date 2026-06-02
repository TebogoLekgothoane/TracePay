import React from "react";
import { View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme-color";

export type TagPillVariant = "airtime_drain" | "hidden_fee" | "loan_shark" | "subscription_trap" | "debit_order";

const LABELS: Record<TagPillVariant, string> = {
  airtime_drain: "AIRTIME DRAIN",
  hidden_fee: "HIDDEN FEE",
  loan_shark: "LOAN SHARK",
  subscription_trap: "SUBSCRIPTION",
  debit_order: "DEBIT ORDER",
};

type TagPillProps = {
  variant: TagPillVariant;
};

export function TagPill({ variant }: TagPillProps) {
  const { isDark } = useTheme();

  let bgBase: string;
  let textColor: string;

  if (variant === "airtime_drain") {
    bgBase = isDark ? Colors.dark.warningYellow : Colors.light.warningYellow;
    textColor = bgBase;
  } else if (variant === "hidden_fee") {
    bgBase = isDark ? Colors.dark.alarmRed : Colors.light.alarmRed;
    textColor = bgBase;
  } else if (variant === "subscription_trap") {
    bgBase = isDark ? Colors.dark.info : Colors.light.info;
    textColor = bgBase;
  } else if (variant === "debit_order") {
    bgBase = isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen;
    textColor = bgBase;
  } else {
    bgBase = isDark ? Colors.dark.text : Colors.light.text;
    textColor = "#FFFFFF";
  }

  const backgroundColor = variant === "loan_shark" ? bgBase : bgBase + "20";

  return (
    <View
      className="rounded-full px-2 py-1"
      style={{ backgroundColor }}
    >
      <ThemedText type="small" className="text-xs" style={{ color: textColor }}>
        {LABELS[variant]}
      </ThemedText>
    </View>
  );
}
