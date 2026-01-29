import React from "react";
import { View, FlatList, Pressable } from "react-native";
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
import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { EmptyState } from "@/components/empty-state";
import { FloatingButton } from "@/components/floating-button";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, Colors, getSeverityColor, type Severity } from "@/constants/theme";
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

  const severityColor = getSeverityColor(
    category.severity as Severity,
    isDark ? "dark" : "light"
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  return (
    <Animated.View entering={FadeInDown.delay(200 + index * 80).springify()}>
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className="rounded-xl p-4 border-l-[3px] flex-1"
        style={[
          {
            backgroundColor: theme.backgroundDefault,
            borderLeftColor: severityColor,
          },
          animatedStyle,
        ]}
        testID={`card-category-${category.id}`}
      >
        <View className="flex-1">
          <View className="flex-row justify-between items-center mb-2">
            <ThemedText type="h4" className="flex-1">
              {language === "xh" ? category.nameXhosa : category.name}
            </ThemedText>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
          <View className="flex-row items-baseline justify-between">
            <ThemedText type="h2" className="font-bold" style={{ color: severityColor }}>
              R{category.amount.toLocaleString()}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
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

  const spentBg = isDark ? Colors.dark.alarmRed + "15" : Colors.light.alarmRed + "15";
  const saveBg = isDark ? Colors.dark.hopeGreen + "15" : Colors.light.hopeGreen + "15";
  const spentColor = isDark ? Colors.dark.alarmRed : Colors.light.alarmRed;
  const saveColor = isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen;

  return (
    <Animated.View
      entering={FadeInDown.delay(150).springify()}
      className="rounded-xl p-4 mb-4"
      style={{ backgroundColor: theme.backgroundDefault }}
    >
      <View className="flex-row items-center gap-3 mb-4">
        <View
          className="w-10 h-10 rounded-lg items-center justify-center"
          style={{ backgroundColor: Colors.light.warningYellow + "20" }}
        >
          <Feather name="smartphone" size={20} color={Colors.light.warningYellow} />
        </View>
        <ThemedText type="h4">{t("momoSavingsTitle")}</ThemedText>
      </View>

      <View className="p-3 rounded-lg mb-2 items-center" style={{ backgroundColor: spentBg }}>
        <ThemedText type="body" style={{ color: theme.textSecondary }}>
          {t("youSpent")}
        </ThemedText>
        <ThemedText type="h3" style={{ color: spentColor }}>
          R{momoData.totalSpent}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {t("onMomo")}
        </ThemedText>
      </View>

      <View className="p-3 rounded-lg mb-2 items-center" style={{ backgroundColor: saveBg }}>
        <ThemedText type="body" style={{ color: theme.textSecondary }}>
          {t("couldSpend")}
        </ThemedText>
        <ThemedText type="h3" style={{ color: saveColor }}>
          R{momoData.alternativeCost}
        </ThemedText>
      </View>

      <View className="items-center pt-4 mt-2 border-t border-gray-200/10">
        <ThemedText type="body">{t("couldSave")}</ThemedText>
        <ThemedText type="h1" style={{ color: saveColor }}>
          R{momoData.potentialSavings}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {t("thisMonthLower")}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

function EmptyStateContent() {
  const { t } = useApp();
  return (
    <EmptyState
      title={t("nothingWrong")}
      description={t("nothingWrongDetail")}
      image={require("../assets/images/empty-analysis.png")}
    />
  );
}

function TotalLossCard({ amount }: { amount: number }) {
  const { t } = useApp();
  const { isDark } = useTheme();
  const bgColor = isDark ? Colors.dark.alarmRed : Colors.light.alarmRed;

  return (
    <Animated.View
      entering={FadeInDown.delay(100).springify()}
      className="rounded-2xl p-6 mb-4 items-center"
      style={{ backgroundColor: bgColor }}
    >
      <ThemedText type="small" className="text-white/80 mb-1">
        {t("lostTotal")}
      </ThemedText>
      <ThemedText type="hero" className="text-white">
        R{amount.toLocaleString()}
      </ThemedText>
      <ThemedText type="small" className="text-white/70 mt-1">
        {t("thisMonth")}
      </ThemedText>
    </Animated.View>
  );
}

export default function AutopsyDashboardScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const { isDark } = useTheme();
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
  const voiceBg = isDark ? Colors.dark.info : Colors.light.info;

  const ListHeader = () => (
    <View>
      {totalLoss > 0 ? <TotalLossCard amount={totalLoss} /> : null}
      {hasMomoData ? <MoMoSavingsCard /> : null}
    </View>
  );

  return (
    <ThemedView className="flex-1">
      <FlatList
        className="flex-1"
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["2xl"],
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={categories}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={<EmptyStateContent />}
        renderItem={({ item, index }) => (
          <LossCategoryCard
            category={item}
            index={index}
            onPress={() => handleCategoryPress(item)}
            language={language}
          />
        )}
        ItemSeparatorComponent={() => <View className="h-4" />}
      />

      <FloatingButton>
        <Pressable
          onPress={handleVoicePress}
          className="w-14 h-14 rounded-full items-center justify-center shadow-lg active:opacity-90"
          style={{ backgroundColor: voiceBg }}
          testID="button-voice"
        >
          <Feather name="volume-2" size={22} color="#FFFFFF" />
        </Pressable>
      </FloatingButton>
    </ThemedView>
  );
}
