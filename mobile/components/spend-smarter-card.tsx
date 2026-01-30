import React from "react";
import { View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { Spacing, BorderRadius } from "@/constants/theme";
import { formatZar } from "@/components/utils/money";
import type { PartnerRecommendationRow } from "@/lib/api";
import type { SpendingByCategory } from "@/lib/api";

const NAVY = "#1e40af";
const navyTint = "rgba(30, 64, 175, 0.12)";

export interface SpendSmarterSuggestion {
  rec: PartnerRecommendationRow;
  spending: SpendingByCategory;
}

export function SpendSmarterCard({
  suggestion,
  onPress,
}: {
  suggestion: SpendSmarterSuggestion;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const { rec, spending } = suggestion;

  const content = (
    <View
      style={{
        padding: Spacing.lg,
        borderRadius: BorderRadius.lg,
        backgroundColor: theme.backgroundSecondary,
        borderWidth: 1,
        borderLeftWidth: 4,
        borderColor: theme.backgroundTertiary,
        borderLeftColor: NAVY,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.sm }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: BorderRadius.sm,
            backgroundColor: navyTint,
            alignItems: "center",
            justifyContent: "center",
            marginRight: Spacing.sm,
          }}
        >
          <Feather name="trending-down" size={18} color={NAVY} />
        </View>
        <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }}>
          You spend {formatZar(spending.totalSpent)} on {spending.label}
        </ThemedText>
      </View>
      <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", fontSize: 16, marginBottom: 4 }}>
        {rec.partner_name}: {rec.title}
      </ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md, lineHeight: 20 }}>
        {rec.description}
      </ThemedText>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View
          style={{
            paddingVertical: 4,
            paddingHorizontal: Spacing.sm,
            borderRadius: BorderRadius.sm,
            backgroundColor: NAVY + "20",
          }}
        >
          <ThemedText type="small" style={{ color: NAVY, fontWeight: "600", fontSize: 13 }}>
            {rec.savings_estimate}
          </ThemedText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <ThemedText type="small" style={{ color: NAVY, fontWeight: "600", marginRight: 4 }}>
            {rec.cta_label}
          </ThemedText>
          <Feather name="chevron-right" size={16} color={NAVY} />
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, marginBottom: Spacing.md })}>
        {content}
      </Pressable>
    );
  }
  return <View style={{ marginBottom: Spacing.md }}>{content}</View>;
}
