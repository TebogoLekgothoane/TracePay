import React from "react";
import { View, type ViewProps } from "react-native";

import { AppText } from "@/components/Typography";
import { GlassSurface } from "@/components/GlassSurface";
import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/cn";
import type { TextVariant } from "@/theme/typography";

export type CardProps = ViewProps & {
  className?: string;
  contentClassName?: string;
  variant?: "default" | "elevated";
  glass?: boolean;
};

export function Card({
  className,
  contentClassName,
  children,
  variant = "default",
  glass = true,
  ...props
}: CardProps) {
  const { isDarkColorScheme } = useColorScheme();

  if (isDarkColorScheme && glass) {
    return (
      <GlassSurface
        variant={variant === "elevated" ? "elevated" : "default"}
        className={cn("p-5", className)}
        contentClassName={contentClassName}
        {...props}
      >
        {children}
      </GlassSurface>
    );
  }

  return (
    <View
      className={cn("rounded-[20px] bg-card p-5 shadow-sm", className)}
      {...props}
    >
      <View className={cn("w-full", contentClassName)}>{children}</View>
    </View>
  );
}

export type IconCardProps = Omit<CardProps, "children"> & {
  icon: React.ReactNode;
  title?: string;
  description: string;
  descriptionVariant?: TextVariant;
  descriptionClassName?: string;
  contentClassName?: string;
};

export function IconCard({
  icon,
  title,
  description,
  descriptionVariant = "lead",
  descriptionClassName,
  className,
  contentClassName,
  ...props
}: IconCardProps) {
  return (
    <Card
      className={className}
      contentClassName={cn("flex-row items-start gap-4", contentClassName)}
      {...props}
    >
      <View className="shrink-0">{icon}</View>
      <View className="min-w-0 flex-1">
        {title ? (
          <AppText variant="title">{title}</AppText>
        ) : null}
        <AppText
          variant={descriptionVariant}
          className={cn(title && "mt-2", descriptionClassName)}
        >
          {description}
        </AppText>
      </View>
    </Card>
  );
}
