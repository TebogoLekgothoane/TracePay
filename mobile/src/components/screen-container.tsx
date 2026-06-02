import React, { ReactNode } from "react";
import { ScrollView, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";

type ScreenContainerProps = {
  children: ReactNode;
  scroll?: boolean;
  paddingBottom?: number;
  paddingTop?: number;
  className?: string;
};

export function ScreenContainer({
  children,
  scroll = false,
  paddingBottom,
  paddingTop,
  className = "",
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const top = paddingTop ?? Spacing.sm;
  const bottom = paddingBottom ?? Spacing["3xl"];
  const paddingStyle: ViewStyle = {
    paddingTop: insets.top + top,
    paddingBottom: insets.bottom + bottom,
    paddingHorizontal: Spacing.lg,
  };

  if (scroll) {
    return (
      <ThemedView className={`flex-1 ${className}`}>
        <ScrollView
          contentContainerStyle={paddingStyle}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView
      className={`flex-1 px-4 ${className}`}
      style={[{ paddingTop: insets.top + top, paddingBottom: insets.bottom + bottom }]}
    >
      {children}
    </ThemedView>
  );
}
