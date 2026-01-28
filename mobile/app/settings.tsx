import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

    import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

type ThemeMode = "light" | "dark" | "system";

interface SettingsRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  isSelected?: boolean;
  delay: number;
}

function SettingsRow({ icon, label, value, onPress, isSelected, delay }: SettingsRowProps) {
  const { theme, isDark } = useTheme();

  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.settingsRow,
          {
            backgroundColor: theme.backgroundDefault,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={[styles.iconContainer, { backgroundColor: (isDark ? Colors.dark.alarmRed : Colors.light.alarmRed) + "20" }]}>
          <Feather name={icon} size={20} color={isDark ? Colors.dark.alarmRed : Colors.light.alarmRed} />
        </View>
        <ThemedText type="body" style={styles.rowLabel}>
          {label}
        </ThemedText>
        {value ? (
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {value}
          </ThemedText>
        ) : null}
        {isSelected ? (
          <Feather name="check" size={20} color={isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen} />
        ) : null}
        {onPress && !isSelected ? (
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

interface ThemeOptionProps {
  mode: ThemeMode;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  isSelected: boolean;
  onPress: () => void;
  delay: number;
}

function ThemeOption({ mode, label, icon, isSelected, onPress, delay }: ThemeOptionProps) {
  const { theme, isDark } = useTheme();

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.themeOption,
          {
            backgroundColor: isSelected
              ? (isDark ? Colors.dark.alarmRed : Colors.light.alarmRed) + "15"
              : theme.backgroundDefault,
            borderColor: isSelected
              ? isDark ? Colors.dark.alarmRed : Colors.light.alarmRed
              : "transparent",
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        testID={`theme-option-${mode}`}
      >
        <View style={[
          styles.themeIconContainer,
          {
            backgroundColor: isSelected
              ? (isDark ? Colors.dark.alarmRed : Colors.light.alarmRed)
              : theme.backgroundTertiary,
          },
        ]}>
          <Feather
            name={icon}
            size={22}
            color={isSelected ? "#FFFFFF" : theme.textSecondary}
          />
        </View>
        <ThemedText
          type="body"
          style={[
            styles.themeLabel,
            isSelected && { color: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
          ]}
        >
          {label}
        </ThemedText>
        {isSelected ? (
          <Feather name="check-circle" size={20} color={isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const { language, setLanguage, t } = useApp();

  const handleLanguageToggle = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setLanguage(language === "en" ? "xh" : "en");
  };

  const themeModes: { mode: ThemeMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { mode: "light", label: "Light", icon: "sun" },
    { mode: "dark", label: "Dark", icon: "moon" },
    { mode: "system", label: "System", icon: "smartphone" },
  ];

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing["4xl"],
            paddingBottom: tabBarHeight + Spacing["2xl"],
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <ThemedText type="h2" style={styles.screenTitle}>
            Settings
          </ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <ThemedText type="h4" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            Appearance
          </ThemedText>
        </Animated.View>

        <View style={styles.themeOptions}>
          {themeModes.map((item, index) => (
            <ThemeOption
              key={item.mode}
              mode={item.mode}
              label={item.label}
              icon={item.icon}
              isSelected={themeMode === item.mode}
              onPress={() => setThemeMode(item.mode)}
              delay={150 + index * 50}
            />
          ))}
        </View>

        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <ThemedText type="h4" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            Language
          </ThemedText>
        </Animated.View>

        <SettingsRow
          icon="globe"
          label={t("selectLanguage")}
          value={language === "en" ? "English" : "IsiXhosa"}
          onPress={handleLanguageToggle}
          delay={350}
        />

        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <ThemedText type="h4" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            About
          </ThemedText>
        </Animated.View>

        <View style={styles.settingsGroup}>
          <SettingsRow
            icon="info"
            label="Version"
            value="1.0.0"
            delay={450}
          />
          <SettingsRow
            icon="shield"
            label={t("privacyPolicy")}
            onPress={() => {}}
            delay={500}
          />
        </View>

        <Animated.View
          entering={FadeInDown.delay(550).springify()}
          style={[styles.footer, { borderTopColor: theme.backgroundTertiary }]}
        >
          <View style={[styles.logoContainer, { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed }]}>
            <ThemedText type="h3" style={styles.logoText}>T</ThemedText>
          </View>
          <ThemedText type="h4">TracePay</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Financial Forensics
          </ThemedText>
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  screenTitle: {
    marginBottom: Spacing["2xl"],
  },
  sectionTitle: {
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  themeOptions: {
    gap: Spacing.sm,
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    gap: Spacing.lg,
  },
  themeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  themeLabel: {
    flex: 1,
  },
  settingsGroup: {
    gap: Spacing.sm,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
  },
  footer: {
    alignItems: "center",
    paddingTop: Spacing["3xl"],
    marginTop: Spacing["3xl"],
    borderTopWidth: 1,
    gap: Spacing.xs,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  logoText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
