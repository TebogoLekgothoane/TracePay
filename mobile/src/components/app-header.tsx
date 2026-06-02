import React from "react";
import { View, Image, Pressable, StyleProp, ViewStyle, ImageSourcePropType } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { Spacing } from "@/constants/theme";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  titleLogo?: ImageSourcePropType;
  children?: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightAccessory?: React.ReactNode;
};

export function AppHeader({
  title,
  subtitle,
  titleLogo,
  children,
  className = "",
  style,
  showBackButton,
  onBackPress,
  rightAccessory,
}: AppHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={[{ marginBottom: Spacing["2xl"] }, style]} className={className}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {showBackButton ? (
            <Pressable onPress={onBackPress} hitSlop={10} style={{ marginRight: Spacing.sm, padding: Spacing.xs }}>
              <Feather name="arrow-left" size={22} color={theme.text} />
            </Pressable>
          ) : null}
          <Image
            source={require("../assets/trace-pay logo.png")}
            style={{ width: 56, height: 56, marginRight: Spacing.sm }}
            resizeMode="contain"
          />
          <ThemedText type="h1" style={{ color: theme.text, fontSize: 24 }}>
            TracePay
          </ThemedText>
        </View>

        {rightAccessory ? <View style={{ marginLeft: Spacing.lg }}>{rightAccessory}</View> : null}
      </View>

      <View style={{ marginBottom: Spacing.lg, flexDirection: "row", alignItems: "center" }}>
        {titleLogo ? (
          <Image
            source={titleLogo}
            style={{ width: 40, height: 40, borderRadius: 8, marginRight: Spacing.md }}
            resizeMode="contain"
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <ThemedText type="h2" style={{ color: theme.text, marginBottom: 4, fontSize: 22 }}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="body" style={{ color: theme.textSecondary, fontSize: 16, lineHeight: 22 }}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>

      {children}
    </View>
  );
}
