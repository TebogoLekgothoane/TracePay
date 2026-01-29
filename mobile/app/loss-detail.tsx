import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { Transaction } from "@/types/navigation";

interface TransactionItemProps {
  transaction: Transaction;
  index: number;
  severityColor: string;
}

function TransactionItem({ transaction, index, severityColor }: TransactionItemProps) {
  const { theme } = useTheme();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(150 + index * 50).springify()}
      style={[styles.transactionItem, { backgroundColor: theme.backgroundDefault }]}
    >
      <View style={styles.transactionLeft}>
        <ThemedText type="body" style={styles.merchantName}>
          {transaction.merchant}
        </ThemedText>
        <ThemedText
          type="small"
          style={[styles.transactionDate, { color: theme.textSecondary }]}
        >
          {formatDate(transaction.date)}
        </ThemedText>
      </View>
      <ThemedText
        type="h4"
        style={[styles.transactionAmount, { color: severityColor }]}
      >
        -R{transaction.amount.toFixed(2)}
      </ThemedText>
    </Animated.View>
  );
}

function InsightCard({ severity }: { severity: string }) {
  const { t, language } = useApp();
  const { theme, isDark } = useTheme();

  const insights: Record<string, { en: string; xh: string }> = {
    critical: {
      en: "This category is taking a significant portion of your income. Consider immediate action to reduce these costs.",
      xh: "Le nqaku ithabatha inxalenye enkulu yomvuzo wakho. Cinga ngokukhawuleza ukunciphisa ezi ndleko.",
    },
    warning: {
      en: "These costs are adding up. Small reductions here can make a big difference over time.",
      xh: "Ezi ndleko ziyongezeka. Ukunciphisa okuncinci apha kunokwenza umahluko omkhulu ekuhambeni kwexesha.",
    },
    info: {
      en: "These are normal expenses but worth monitoring to ensure they stay reasonable.",
      xh: "Ezi ziindleko eziqhelekileyo kodwa kufanelekile ukuzilandelela ukuqinisekisa ukuba zihlala zisengqiqweni.",
    },
  };

  const insight = insights[severity] || insights.info;

  return (
    <Animated.View
      entering={FadeInDown.delay(100).springify()}
      style={[
        styles.insightCard,
        { backgroundColor: isDark ? Colors.dark.warningYellow + "20" : Colors.light.warningYellow + "20" },
      ]}
    >
      <View style={styles.insightHeader}>
        <Feather
          name="alert-circle"
          size={20}
          color={isDark ? Colors.dark.warningYellow : Colors.light.warningYellow}
        />
        <ThemedText type="h4" style={styles.insightTitle}>
          {t("whyThisHurts")}
        </ThemedText>
      </View>
      <ThemedText type="body" style={[styles.insightText, { color: theme.textSecondary }]}>
        {language === "xh" ? insight.xh : insight.en}
      </ThemedText>
    </Animated.View>
  );
}

export default function LossDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const params = useLocalSearchParams<{
    category: string;
    amount: string;
    percentage: string;
    severity: "critical" | "warning" | "info";
    transactions: string;
  }>();
  const { theme, isDark } = useTheme();
  const { t } = useApp();

  const category = params.category || "";
  const amount = parseFloat(params.amount || "0");
  const percentage = parseFloat(params.percentage || "0");
  const severity = params.severity || "info";
  const transactions: Transaction[] = params.transactions ? JSON.parse(params.transactions) : [];

  const getSeverityColor = () => {
    switch (severity) {
      case "critical":
        return isDark ? Colors.dark.alarmRed : Colors.light.alarmRed;
      case "warning":
        return isDark ? Colors.dark.warningYellow : Colors.light.warningYellow;
      default:
        return isDark ? Colors.dark.info : Colors.light.info;
    }
  };

  const severityColor = getSeverityColor();

  const handleFreezePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/freeze-control" as any);
  };

  const ListHeader = () => (
    <View style={styles.headerContent}>
      <View style={styles.titleRow}>
        <Pressable
          onPress={() => router.back()}
          style={{ padding: Spacing.xs, marginRight: Spacing.sm }}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <ThemedText type="h2" className="text-text">
          {category}
        </ThemedText>
      </View>

      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[
          styles.summaryCard,
          {
            backgroundColor: severityColor,
          },
        ]}
      >
        <ThemedText type="h1" style={styles.summaryAmount}>
          R{amount.toLocaleString()}
        </ThemedText>
        <ThemedText type="body" style={styles.summaryPercentage}>
          {percentage}% {t("ofIncome")}
        </ThemedText>
      </Animated.View>

      <InsightCard severity={severity} />

      <ThemedText
        type="h4"
        style={[styles.sectionTitle, { color: theme.textSecondary }]}
      >
        {t("details")}
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing["7xl"],
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={transactions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<ListHeader />}
        renderItem={({ item, index }) => (
          <TransactionItem
            transaction={item}
            index={index}
            severityColor={severityColor}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <View
        style={[
          styles.bottomContainer,
          {
            paddingBottom: insets.bottom + Spacing["2xl"],
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        <Button
          onPress={handleFreezePress}
          style={[styles.freezeButton, { backgroundColor: severityColor }]}
          testID="button-freeze-category"
        >
          {t("freezeThis")}
        </Button>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  headerContent: {
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  summaryCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  summaryAmount: {
    color: "#FFFFFF",
    marginBottom: Spacing.xs,
  },
  summaryPercentage: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  insightCard: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing["2xl"],
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  insightTitle: {},
  insightText: {},
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  transactionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.xs,
  },
  transactionLeft: {
    flex: 1,
  },
  merchantName: {
    marginBottom: Spacing.xs,
  },
  transactionDate: {},
  transactionAmount: {
    fontWeight: "600",
  },
  separator: {
    height: Spacing.sm,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  freezeButton: {
    width: "100%",
  },
});
