import {
  GlassView,
  isGlassEffectAPIAvailable,
} from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Platform,
  StyleSheet,
  View,
  type ViewProps,
} from "react-native";

import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/cn";
import { GLASS } from "@/theme/colors";

export type GlassSurfaceVariant = "default" | "elevated" | "input" | "primary";

export type GlassSurfaceProps = ViewProps & {
  variant?: GlassSurfaceVariant;
  className?: string;
  contentClassName?: string;
  interactive?: boolean;
  radius?: number;
  children?: React.ReactNode;
};

function GlassHighlight({ radius }: { radius: number }) {
  return (
    <>
      <LinearGradient
        colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.03)", "transparent"]}
        locations={[0, 0.35, 1]}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      <View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 h-px bg-white/10"
      />
    </>
  );
}

function FallbackGlass({
  variant,
  radius,
  className,
  contentClassName,
  style,
  children,
  ...props
}: GlassSurfaceProps & { radius: number }) {
  const isPrimary = variant === "primary";
  const surfaceColor =
    variant === "elevated" ? GLASS.surfaceStrong : GLASS.surface;

  return (
    <View
      className={cn("overflow-hidden", className)}
      style={[{ borderRadius: radius }, style]}
      {...props}
    >
      {isPrimary ? (
        <LinearGradient
          colors={[...GLASS.primaryGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <>
          {/* Avoid BlurView in lists — multiple instances break on Android. */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: surfaceColor, borderRadius: radius },
            ]}
          />
          <GlassHighlight radius={radius} />
        </>
      )}
      <View className={cn("relative w-full", contentClassName)}>{children}</View>
    </View>
  );
}

/** Frosted glass panel — native liquid glass on iOS 26+, blur fallback elsewhere. */
export function GlassSurface({
  variant = "default",
  className,
  contentClassName,
  interactive,
  radius = 26,
  children,
  style,
  ...props
}: GlassSurfaceProps) {
  const { isDarkColorScheme } = useColorScheme();
  const useNativeGlass =
    isDarkColorScheme &&
    Platform.OS === "ios" &&
    isGlassEffectAPIAvailable();

  if (!isDarkColorScheme) {
    return (
      <View
        className={cn("overflow-hidden rounded-[26px] bg-card", className)}
        style={[{ borderRadius: radius }, style]}
        {...props}
      >
        <View className={cn("relative w-full", contentClassName)}>{children}</View>
      </View>
    );
  }

  if (useNativeGlass) {
    const tintColor = variant === "primary" ? GLASS.primaryTint : undefined;

    return (
      <GlassView
        glassEffectStyle={variant === "input" ? "clear" : "regular"}
        colorScheme="dark"
        tintColor={tintColor}
        isInteractive={false}
        className={cn("overflow-hidden", className)}
        style={[{ borderRadius: radius }, style]}
        {...props}
      >
        {variant === "primary" ? (
          <LinearGradient
            colors={["rgba(124,58,237,0.55)", "rgba(168,85,247,0.75)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <GlassHighlight radius={radius} />
        )}
        <View className={cn("relative w-full", contentClassName)}>{children}</View>
      </GlassView>
    );
  }

  return (
    <FallbackGlass
      variant={variant}
      radius={radius}
      className={className}
      contentClassName={contentClassName}
      style={style}
      {...props}
    >
      {children}
    </FallbackGlass>
  );
}
