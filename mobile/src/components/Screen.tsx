import React from "react";
import {
  ScrollView,
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

/** Scrollable screen shell using global.css `screen` / `screen-content` classes. */
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
      className={cn("screen", className)}
      contentContainerClassName={cn(padded && "screen-content", contentClassName)}
      contentContainerStyle={[contentPadding, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
