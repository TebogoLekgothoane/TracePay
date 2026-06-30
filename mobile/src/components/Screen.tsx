import React from "react";
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { GlassBackground } from "@/components/GlassBackground";
import { type BottomInset, useScreenInsets } from "@/hooks/useScreenInsets";
import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/cn";

type ScreenProps = ScrollViewProps & {
  className?: string;
  contentClassName?: string;
  padded?: boolean;
  bottomInset?: BottomInset;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/** Scrollable screen shell with optional violet mesh glass background in dark mode. */
export function Screen({
  className,
  contentClassName,
  padded = true,
  bottomInset = "tab",
  children,
  contentContainerStyle,
  ...props
}: ScreenProps) {
  const { contentPadding } = useScreenInsets(bottomInset);
  const { isDarkColorScheme } = useColorScheme();

  const scroll = (
    <ScrollView
      className={cn("screen", isDarkColorScheme && "bg-transparent", className)}
      contentContainerClassName={cn(padded && "screen-content", contentClassName)}
      contentContainerStyle={[contentPadding, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      {...props}
    >
      {children}
    </ScrollView>
  );

  if (isDarkColorScheme) {
    return <GlassBackground>{scroll}</GlassBackground>;
  }

  return scroll;
}

/** Non-scroll screen shell with glass background in dark mode. */
export function ScreenFrame({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { isDarkColorScheme } = useColorScheme();

  const frame = (
    <View className={cn("flex-1 screen", isDarkColorScheme && "bg-transparent", className)}>
      {children}
    </View>
  );

  if (isDarkColorScheme) {
    return <GlassBackground>{frame}</GlassBackground>;
  }

  return frame;
}
