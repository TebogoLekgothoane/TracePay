import React from "react";
import { View, Image, StyleSheet, ViewStyle, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { Spacing, Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  /**
   * Optional element rendered on the right side (e.g. settings icon) or
   * below the subtitle (e.g. a CTA button).
   */
  children?: React.ReactNode;
  style?: ViewStyle;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightAccessory?: React.ReactNode;
};

export function AppHeader({
  title,
  subtitle,
  children,
  style,
  showBackButton,
  onBackPress,
  rightAccessory,
}: AppHeaderProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        <View style={styles.brandRow}>
          {showBackButton ? (
            <Pressable
              onPress={onBackPress}
              hitSlop={10}
              style={{ marginRight: Spacing.sm, padding: 4 }}
            >
              <Feather name="arrow-left" size={20} color={theme.text} />
            </Pressable>
          ) : null}
          <Image
            source={require("../assets/trace-pay logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <ThemedText type="h1" className="text-text">
            TracePay
          </ThemedText>
        </View>

        {rightAccessory ? <View style={styles.right}>{rightAccessory}</View> : null}
      </View>

      <View style={styles.copy}>
        <ThemedText type="h2" className="text-text mb-1">
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="body" className="text-text-muted">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing["3xl"],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 56,
    height: 56,
    marginRight: Spacing.sm,
  },
  copy: {
    marginBottom: Spacing.md,
  },
  right: {
    marginLeft: Spacing.lg,
  },
});

