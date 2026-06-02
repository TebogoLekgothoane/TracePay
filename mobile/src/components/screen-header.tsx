import React from "react";
import { View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";

type ScreenHeaderProps = {
  title: string;
  onBack: () => void;
  subtitle?: string;
};

export function ScreenHeader({ title, onBack, subtitle }: ScreenHeaderProps) {
  const { theme } = useTheme();

  return (
    <View className="mb-8">
      <View className="flex-row items-center mb-4">
        <Pressable
          onPress={onBack}
          hitSlop={10}
          className="mr-2 p-1 active:opacity-70"
        >
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <ThemedText type="h2" className="text-text">
          {title}
        </ThemedText>
      </View>
      {subtitle ? (
        <ThemedText type="body" className="text-text-muted mt-1">
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}
