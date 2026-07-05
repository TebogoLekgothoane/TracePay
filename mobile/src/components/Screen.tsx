import React from "react";
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { type BottomInset, useScreenInsets } from "@/hooks/useScreenInsets";
import { cn } from "@/lib/cn";

type ScreenProps = ScrollViewProps & {
  className?: string;
  contentClassName?: string;
  padded?: boolean;
  bottomInset?: BottomInset;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/** Scrollable screen shell with solid app background (no glass mesh bleed-through). */
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

  return (
    <ScrollView
      className={cn(
        "flex-1",
        "bg-background",
        className,
      )}
      contentContainerClassName={cn(padded && "screen-content", contentClassName)}
      contentContainerStyle={[contentPadding, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      {...props}
    >
      {children}
    </ScrollView>
  );
}

/** Non-scroll screen shell with solid app background. */
export function ScreenFrame({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      className={cn(
        "flex-1",
        "bg-background",
        className,
      )}
    >
      {children}
    </View>
  );
}
