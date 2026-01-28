import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { LossCategory, Language } from "@/types/app";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface LossCategoryCardProps {
  category: LossCategory;
  index: number;
  onPress: () => void;
  language: Language;
}

function LossCategoryCard({ category, index, onPress, language }: LossCategoryCardProps) {
  const { theme, isDark } = useTheme();
  const { t } = useApp();
  const scale = useSharedValue(1);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return isDark ? Colors.dark.alarmRed : Colors.light.alarmRed;
      case "warning":
        return isDark ? Colors.dark.warningYellow : Colors.light.warningYellow;
      default:
        return isDark ? Colors.dark.info : Colors.light.info;
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const severityColor = getSeverityColor(category.severity);

  return (
    <Animated.View entering={FadeInDown.delay(200 + index * 80).springify()}>
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.categoryCard,
          {
            backgroundColor: theme.backgroundDefault,
            borderLeftColor: severityColor,
          },
          animatedStyle,
        ]}
        testID={`card-category-${category.id}`}
      >
        <View style={styles.categoryContent}>
          <View style={styles.categoryHeader}>
            <ThemedText type="h4" style={styles.categoryName}>
              {language === "xh" ? category.nameXhosa : category.name}
            </ThemedText>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
          <View style={styles.categoryStats}>
            <ThemedText
              type="h2"
              style={[styles.categoryAmount, { color: severityColor }]}
            >
              R{category.amount.toLocaleString()}
            </ThemedText>
            <ThemedText
              type="small"
              style={[styles.categoryPercentage, { color: theme.textSecondary }]}
            >
              {category.percentage}% {t("ofIncome")}
            </ThemedText>
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

function MoMoSavingsCard() {
  const { theme, isDark } = useTheme();
  const { t, analysisData } = useApp();

  const momoData = analysisData?.momoData;
  if (!momoData) return null;

  return (
    <Animated.View
      entering={FadeInDown.delay(150).springify()}
      style={[styles.momoCard, { backgroundColor: theme.backgroundDefault }]}
    >
      <View style={styles.momoHeader}>
        <View style={[styles.momoIcon, { backgroundColor: Colors.light.warningYellow + "20" }]}>
          <Feather name="smartphone" size={20} color={Colors.light.warningYellow} />
        </View>
        <ThemedText type="h4">{t("momoSavingsTitle")}</ThemedText>
      </View>

      <View style={[styles.momoRow, { backgroundColor: isDark ? Colors.dark.alarmRed + "15" : Colors.light.alarmRed + "15" }]}>
        <ThemedText type="body" style={{ color: theme.textSecondary }}>
          {t("youSpent")}
        </ThemedText>
        <ThemedText type="h3" style={{ color: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed }}>
          R{momoData.totalSpent}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {t("onMomo")}
        </ThemedText>
      </View>

      <View style={[styles.momoRow, { backgroundColor: isDark ? Colors.dark.hopeGreen + "15" : Colors.light.hopeGreen + "15" }]}>
        <ThemedText type="body" style={{ color: theme.textSecondary }}>
          {t("couldSpend")}
        </ThemedText>
        <ThemedText type="h3" style={{ color: isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen }}>
          R{momoData.alternativeCost}
        </ThemedText>
      </View>

      <View style={styles.savingsHighlight}>
        <ThemedText type="body">{t("couldSave")}</ThemedText>
        <ThemedText type="h1" style={{ color: isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen }}>
          R{momoData.potentialSavings}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {t("thisMonthLower")}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

function EmptyState() {
  const { t } = useApp();
  const { theme } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      style={styles.emptyContainer}
    >
      <Image
        source={require("../assets/images/empty-analysis.png")}
        style={styles.emptyImage}
        contentFit="contain"
      />
      <ThemedText type="h2" style={styles.emptyTitle}>
        {t("nothingWrong")}
      </ThemedText>
      <ThemedText
        type="body"
        style={[styles.emptyText, { color: theme.textSecondary }]}
      >
        {t("nothingWrongDetail")}
      </ThemedText>
    </Animated.View>
  );
}

function TotalLossCard({ amount }: { amount: number }) {
  const { t } = useApp();
  const { isDark } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.delay(100).springify()}
      style={[
        styles.totalCard,
        { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
      ]}
    >
      <ThemedText type="small" style={styles.totalLabel}>
        {t("lostTotal")}
      </ThemedText>
      <ThemedText type="hero" style={styles.totalAmount}>
        R{amount.toLocaleString()}
      </ThemedText>
      <ThemedText type="small" style={styles.totalPeriod}>
        {t("thisMonth")}
      </ThemedText>
    </Animated.View>
  );
}

export default function AutopsyDashboardScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { analysisData, language, t, includeMomoData } = useApp();

  const handleCategoryPress = async (category: LossCategory) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/loss-detail" as any,
      params: {
        category: language === "xh" ? category.nameXhosa : category.name,
        amount: category.amount.toString(),
        percentage: category.percentage.toString(),
        severity: category.severity,
        transactions: JSON.stringify(category.transactions),
      },
    });
  };

  const handleVoicePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/voicemodal" as any);
  };

  const categories = analysisData?.categories || [];
  const totalLoss = analysisData?.totalLoss || 0;
  const hasMomoData = includeMomoData && analysisData?.momoData;

  const ListHeader = () => (
    <View>
      {totalLoss > 0 ? <TotalLossCard amount={totalLoss} /> : null}
      {hasMomoData ? <MoMoSavingsCard /> : null}
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
            paddingBottom: insets.bottom + Spacing["2xl"],
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={categories}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={<EmptyState />}
        renderItem={({ item, index }) => (
          <LossCategoryCard
            category={item}
            index={index}
            onPress={() => handleCategoryPress(item)}
            language={language}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <Animated.View
        entering={FadeInDown.delay(600).springify()}
        style={[
          styles.voiceButtonContainer,
          { bottom: insets.bottom + Spacing.lg },
        ]}
      >
        <Pressable
          onPress={handleVoicePress}
          style={({ pressed }) => [
            styles.voiceButton,
            {
              backgroundColor: isDark ? Colors.dark.info : Colors.light.info,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
          testID="button-voice"
        >
          <Feather name="volume-2" size={22} color="#FFFFFF" />
        </Pressable>
      </Animated.View>
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
  totalCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    marginBottom: Spacing.lg,
    alignItems: "center",
  },
  totalLabel: {
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: Spacing.xs,
  },
  totalAmount: {
    color: "#FFFFFF",
  },
  totalPeriod: {
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: Spacing.xs,
  },
  momoCard: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  momoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  momoIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  momoRow: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    marginBottom: Spacing.sm,
    alignItems: "center",
  },
  savingsHighlight: {
    alignItems: "center",
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.1)",
    marginTop: Spacing.sm,
  },
  categoryCard: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    borderLeftWidth: 3,
  },
  categoryContent: {
    flex: 1,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  categoryName: {
    flex: 1,
  },
  categoryStats: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  categoryAmount: {
    fontWeight: "700",
  },
  categoryPercentage: {},
  separator: {
    height: Spacing.md,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["6xl"],
  },
  emptyImage: {
    width: 180,
    height: 180,
    marginBottom: Spacing["2xl"],
  },
  emptyTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  emptyText: {
    textAlign: "center",
  },
  voiceButtonContainer: {
    position: "absolute",
    right: Spacing.lg,
  },
  voiceButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
});
