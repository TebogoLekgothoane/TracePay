import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
} from "react-native";

import { GlassSurface } from "@/components/GlassSurface";
import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/cn";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link"
  | "accent"
  | "info";

type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  flex?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  textClassName?: string;
};

function isTextChild(children: React.ReactNode): children is string {
  return typeof children === "string";
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "py-2.5 px-3.5 rounded-full min-h-[40px]",
  md: "py-3.5 px-5 rounded-full min-h-[48px]",
  lg: "py-[17px] px-6 rounded-full min-h-[54px]",
  icon: "w-11 h-11 p-0 rounded-full min-h-[44px]",
};

const textSizeClasses: Record<ButtonSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-[17px]",
  icon: "text-sm",
};

const lightVariantClasses: Record<
  ButtonVariant,
  { container: string; text: string; spinnerColor: string }
> = {
  primary: {
    container: "bg-brand-purple shadow-md",
    text: "text-primary-foreground",
    spinnerColor: "#FFFFFF",
  },
  secondary: {
    container: "bg-secondary",
    text: "text-secondary-foreground",
    spinnerColor: "#374151",
  },
  outline: {
    container: "border-[1.5px] border-border bg-card shadow-sm",
    text: "text-muted-foreground",
    spinnerColor: "#6B7280",
  },
  ghost: {
    container: "bg-transparent",
    text: "text-primary",
    spinnerColor: "#7C3AED",
  },
  destructive: {
    container: "bg-destructive",
    text: "text-primary-foreground",
    spinnerColor: "#FFFFFF",
  },
  link: {
    container: "bg-transparent py-1 px-0 min-h-0",
    text: "text-primary font-semibold text-sm",
    spinnerColor: "#7C3AED",
  },
  accent: {
    container: "bg-neon-purple rounded-full h-12 py-0",
    text: "text-white text-base",
    spinnerColor: "#FFFFFF",
  },
  info: {
    container: "bg-info rounded-full h-12 py-0",
    text: "text-white text-base",
    spinnerColor: "#FFFFFF",
  },
};

const darkVariantClasses: Record<
  ButtonVariant,
  {
    container: string;
    text: string;
    spinnerColor: string;
    glass?: "default" | "elevated" | "primary" | "input";
  }
> = {
  primary: {
    container: "shadow-none",
    text: "text-white",
    spinnerColor: "#FFFFFF",
    glass: "primary",
  },
  secondary: {
    container: "shadow-none",
    text: "text-white/85",
    spinnerColor: "#FFFFFF",
    glass: "default",
  },
  outline: {
    container: "shadow-none",
    text: "text-white/70",
    spinnerColor: "#A855F7",
    glass: "default",
  },
  ghost: {
    container: "bg-transparent shadow-none",
    text: "text-primary",
    spinnerColor: "#A855F7",
  },
  destructive: {
    container: "bg-destructive/90 shadow-none",
    text: "text-white",
    spinnerColor: "#FFFFFF",
  },
  link: {
    container: "bg-transparent py-1 px-0 min-h-0 shadow-none",
    text: "text-primary font-semibold text-sm",
    spinnerColor: "#A855F7",
  },
  accent: {
    container: "shadow-none",
    text: "text-white text-base",
    spinnerColor: "#FFFFFF",
    glass: "primary",
  },
  info: {
    container: "bg-info/90 shadow-none",
    text: "text-white text-base",
    spinnerColor: "#FFFFFF",
  },
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  flex = false,
  icon,
  iconRight,
  children,
  className,
  textClassName,
  onPress,
  testID,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const { isDarkColorScheme } = useColorScheme();
  const isDisabled = disabled || loading;
  const hasCustomChildren = children != null && !isTextChild(children);
  const darkStyle = darkVariantClasses[variant];
  const lightStyle = lightVariantClasses[variant];
  const variantStyle = isDarkColorScheme ? darkStyle : lightStyle;
  const glassVariant = isDarkColorScheme ? darkStyle.glass : undefined;
  const useGlass = Boolean(glassVariant);

  const content = loading ? (
    <ActivityIndicator color={variantStyle.spinnerColor} size="small" />
  ) : (
    <>
      {icon}
      {hasCustomChildren ? (
        children
      ) : children != null ? (
        <Text
          className={cn(
            "font-bold text-center",
            textSizeClasses[size],
            variantStyle.text,
            textClassName,
          )}
        >
          {children}
        </Text>
      ) : null}
      {iconRight}
    </>
  );

  const pressableClasses = cn(
    "flex-row items-center justify-center gap-2 active:opacity-90 active:scale-[0.98]",
    sizeClasses[size],
    !useGlass && variantStyle.container,
    fullWidth && "w-full",
    flex && "flex-1",
    isDisabled && "opacity-40",
    useGlass && "overflow-hidden",
    className,
  );

  if (useGlass) {
    const radius = size === "icon" ? 22 : size === "sm" ? 20 : 24;

    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel ?? (isTextChild(children) ? children : undefined)
        }
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        className={cn(
          "relative overflow-hidden",
          pressableClasses,
          fullWidth && "w-full",
          flex && "flex-1",
          isDisabled && "opacity-40",
          className,
        )}
        style={{ borderRadius: radius }}
        {...rest}
      >
        <GlassSurface
          variant={glassVariant ?? "default"}
          interactive={false}
          radius={radius}
          className="absolute inset-0"
          pointerEvents="none"
        />
        <View className="relative z-10 flex-row items-center justify-center gap-2">
          {content}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (isTextChild(children) ? children : undefined)
      }
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={pressableClasses}
      {...rest}
    >
      {content}
    </Pressable>
  );
}
