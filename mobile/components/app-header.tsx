import React from "react";
import { View, Image, Pressable, StyleProp, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
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
  children,
  className = "",
  style,
  showBackButton,
  onBackPress,
  rightAccessory,
}: AppHeaderProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  return (
    <View className={`mb-8 ${className}`} style={style}>
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          {showBackButton ? (
            <Pressable
              onPress={onBackPress}
              hitSlop={10}
              className="mr-2 p-1 active:opacity-70"
            >
              <Feather name="arrow-left" size={20} color={theme.text} />
            </Pressable>
          ) : null}
          <Image
            source={require("../assets/trace-pay logo.png")}
            className="w-14 h-14 mr-2"
            resizeMode="contain"
          />
          <ThemedText type="h1" className="text-text">
            TracePay
          </ThemedText>
        </View>

        {rightAccessory ? <View className="ml-4">{rightAccessory}</View> : null}
      </View>

      <View className="mb-4">
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
