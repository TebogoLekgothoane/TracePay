import React from "react";
import { Text, type TextProps } from "react-native";

import { cn } from "@/lib/cn";
import { textVariants, type TextVariant } from "@/theme/typography";

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  className?: string;
  children?: React.ReactNode;
};

/** App text with a predefined typography variant. */
export function AppText({
  variant = "body",
  className,
  children,
  ...props
}: AppTextProps) {
  return (
    <Text className={cn(textVariants[variant], className)} {...props}>
      {children}
    </Text>
  );
}
