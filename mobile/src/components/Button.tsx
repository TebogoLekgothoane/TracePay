import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableProps,
} from "react-native";

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
  sm: "py-2.5 px-3.5 rounded-[10px] min-h-[40px]",
  md: "py-3.5 px-5 rounded-[14px] min-h-[48px]",
  lg: "py-[17px] px-6 rounded-[14px] min-h-[54px]",
  icon: "w-11 h-11 p-0 rounded-xl min-h-[44px]",
};

const textSizeClasses: Record<ButtonSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-[17px]",
  icon: "text-sm",
};

const variantClasses: Record<
  ButtonVariant,
  { container: string; text: string; spinnerColor: string }
> = {
  primary: {
    container: "bg-brand-purple shadow-md dark:bg-violet-400",
    text: "text-white",
    spinnerColor: "#FFFFFF",
  },
  secondary: {
    container: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-700 dark:text-gray-200",
    spinnerColor: "#374151",
  },
  outline: {
    container: "border-[1.5px] border-border bg-white shadow-sm dark:border-gray-600 dark:bg-gray-800",
    text: "text-gray-500 dark:text-gray-300",
    spinnerColor: "#6B7280",
  },
  ghost: {
    container: "bg-transparent",
    text: "text-brand-purple",
    spinnerColor: "#7C3AED",
  },
  destructive: {
    container: "bg-red-600",
    text: "text-white",
    spinnerColor: "#FFFFFF",
  },
  link: {
    container: "bg-transparent py-1 px-0 min-h-0",
    text: "text-brand-purple font-semibold text-sm",
    spinnerColor: "#7C3AED",
  },
  accent: {
    container: "bg-neon-purple rounded-3xl h-12 py-0",
    text: "text-white text-base",
    spinnerColor: "#FFFFFF",
  },
  info: {
    container: "bg-info rounded-3xl h-12 py-0",
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
  const isDisabled = disabled || loading;
  const hasCustomChildren = children != null && !isTextChild(children);
  const variantStyle = variantClasses[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (isTextChild(children) ? children : undefined)}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={cn(
        "flex-row items-center justify-center rounded-full gap-2 active:opacity-90 active:scale-[0.98]",
        sizeClasses[size],
        variantStyle.container,
        fullWidth && "w-full",
        flex && "flex-1",
        isDisabled && "opacity-40",
        className,
      )}
      {...rest}
    >
      {loading ? (
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
      )}
    </Pressable>
  );
}
