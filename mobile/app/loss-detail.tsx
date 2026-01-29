import React from "react";
import { View, FlatList, Pressable } from "react-native";
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
import { Spacing, Colors, getSeverityColor } from "@/constants/theme";
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
      className="flex-row justify-between items-center p-4 rounded-lg"
      style={{ backgroundColor: theme.backgroundDefault }}
    >
      <View className="flex-1">
        <ThemedText type="body" className="mb-1">
          {transaction.merchant}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {formatDate(transaction.date)}
        </ThemedText>
      </View>
      <ThemedText type="h4" className="font-semibold" style={{ color: severityColor }}>
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
  const bgColor = isDark ? Colors.dark.warningYellow + "20" : Colors.light.warningYellow + "20";
  const iconColor = isDark ? Colors.dark.warningYellow : Colors.light.warningYellow;

  return (
    <Animated.View
      entering={FadeInDown.delay(100).springify()}
      className="rounded-xl p-4 mb-8"
      style={{ backgroundColor: bgColor }}
    >
      <View className="flex-row items-center gap-2 mb-2">
        <Feather name="alert-circle" size={20} color={iconColor} />
        <ThemedText type="h4">{t("whyThisHurts")}</ThemedText>
      </View>
      <ThemedText type="body" style={{ color: theme.textSecondary }}>
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

  const severityColor = getSeverityColor(
    severity,
    isDark ? "dark" : "light"
  );

  const handleFreezePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/freeze-control" as any);
  };

  const ListHeader = () => (
    <View className="mb-4">
      <View className="flex-row items-center mb-4">
        <Pressable
          onPress={() => router.back()}
          className="mr-2 p-1"
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
        className="rounded-2xl p-6 items-center mb-4"
        style={{ backgroundColor: severityColor }}
      >
        <ThemedText type="h1" className="text-white mb-1">
          R{amount.toLocaleString()}
        </ThemedText>
        <ThemedText type="body" className="text-white/80">
          {percentage}% {t("ofIncome")}
        </ThemedText>
      </Animated.View>

      <InsightCard severity={severity} />

      <ThemedText type="h4" className="mb-3" style={{ color: theme.textSecondary }}>
        {t("details")}
      </ThemedText>
    </View>
  );

  return (
    <ThemedView className="flex-1">
      <FlatList
        className="flex-1"
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["7xl"],
          paddingHorizontal: Spacing.lg,
        }}
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
        ItemSeparatorComponent={() => <View className="h-2" />}
      />

      <View
        className="absolute bottom-0 left-0 right-0 px-4 pt-4"
        style={{
          paddingBottom: insets.bottom + Spacing["2xl"],
          backgroundColor: theme.backgroundRoot,
        }}
      >
        <Button
          onPress={handleFreezePress}
          className="w-full"
          style={{ backgroundColor: severityColor }}
          testID="button-freeze-category"
        >
          {t("freezeThis")}
        </Button>
      </View>
    </ThemedView>
  );
}
