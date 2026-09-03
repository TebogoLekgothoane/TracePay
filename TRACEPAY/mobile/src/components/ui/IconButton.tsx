import type { ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";

export type IconButtonVariant = "outline" | "muted" | "ghost" | "soft";
export type IconButtonSize = "sm" | "md";

type Props = Omit<PressableProps, "children"> & {
  children: ReactNode;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  className?: string;
};

const VARIANT: Record<IconButtonVariant, string> = {
  outline: "border border-border bg-card",
  muted: "bg-muted",
  ghost: "bg-transparent",
  soft: "bg-primary/10",
};

const SIZE: Record<IconButtonSize, string> = {
  sm: "h-10 w-10",
  md: "h-11 w-11",
};

export function IconButton({
  children,
  variant = "outline",
  size = "sm",
  disabled,
  className = "",
  accessibilityRole = "button",
  ...props
}: Props) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      className={`items-center justify-center rounded-full active:opacity-75 ${SIZE[size]} ${VARIANT[variant]} ${disabled ? "opacity-50" : ""} ${className}`}
      {...props}
    >
      {children}
    </Pressable>
  );
}
