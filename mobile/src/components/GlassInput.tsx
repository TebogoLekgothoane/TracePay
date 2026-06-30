import React from "react";
import { View, type ViewProps } from "react-native";

import { GlassSurface } from "@/components/GlassSurface";
import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/cn";

export type GlassInputProps = ViewProps & {
  className?: string;
  children?: React.ReactNode;
};

/** Pill-shaped liquid glass input shell for dark mode. */
export function GlassInput({ className, children, ...props }: GlassInputProps) {
  const { isDarkColorScheme } = useColorScheme();

  if (isDarkColorScheme) {
    return (
      <GlassSurface
        variant="input"
        interactive
        radius={9999}
        className="px-3.5 py-3"
        contentClassName={cn("min-h-[48px] flex-row items-center gap-2.5", className)}
        {...props}
      >
        {children}
      </GlassSurface>
    );
  }

  return (
    <View
      className={cn(
        "min-h-[48px] flex-row items-center gap-2.5 rounded-full border-[1.5px] border-input bg-muted px-3.5 py-3",
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}
