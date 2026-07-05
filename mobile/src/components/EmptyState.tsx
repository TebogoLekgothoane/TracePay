import React from "react";
import { Pressable, View, type ViewProps } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Card } from "@/components/Card";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/cn";

export type EmptyStateTone = "default" | "brand" | "muted";

export type EmptyStateProps = ViewProps & {
  icon?: React.ReactNode;
  title?: string;
  description: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onPress?: () => void;
  tone?: EmptyStateTone;
  /** Wrap content in a Card. Set false for flat lists and modals. */
  card?: boolean;
  glass?: boolean;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

const toneCardClasses: Record<EmptyStateTone, string> = {
  default: "border border-dashed border-border dark:border-white/15",
  brand:
    "border border-dashed border-brand-purple/30 bg-brand-purple-light dark:border-primary/30 dark:bg-primary/10",
  muted: "border border-dashed border-border bg-muted/40 dark:border-white/10 dark:bg-white/5",
};

const toneTitleClasses: Record<EmptyStateTone, string> = {
  default: "text-foreground",
  brand: "text-brand-purple dark:text-primary",
  muted: "text-foreground",
};

function EmptyStateContent({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  tone = "default",
  contentClassName,
  titleClassName,
  descriptionClassName,
}: Pick<
  EmptyStateProps,
  | "icon"
  | "title"
  | "description"
  | "actionLabel"
  | "actionIcon"
  | "tone"
  | "contentClassName"
  | "titleClassName"
  | "descriptionClassName"
>) {
  const { colors } = useColorScheme();

  return (
    <View className={cn("items-center gap-3", contentClassName)}>
      {icon ? <View className="shrink-0">{icon}</View> : null}
      {title ? (
        <AppText
          variant="title"
          className={cn("text-center", toneTitleClasses[tone], titleClassName)}
        >
          {title}
        </AppText>
      ) : null}
      <AppText
        variant="bodySm"
        className={cn(
          "max-w-[300px] text-center leading-5 text-muted-foreground",
          descriptionClassName,
        )}
      >
        {description}
      </AppText>
      {actionLabel ? (
        <View className="mt-1 flex-row items-center gap-1">
          {actionIcon ?? null}
          <AppText variant="label" className={toneTitleClasses[tone]}>
            {actionLabel}
          </AppText>
          {!actionIcon ? (
            <Feather name="chevron-right" size={16} color={colors.primary} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onPress,
  tone = "default",
  card = true,
  glass = false,
  className,
  contentClassName,
  titleClassName,
  descriptionClassName,
  ...props
}: EmptyStateProps) {
  const content = (
    <EmptyStateContent
      icon={icon}
      title={title}
      description={description}
      actionLabel={actionLabel}
      actionIcon={actionIcon}
      tone={tone}
      contentClassName={cn(card ? "py-6" : "py-10", contentClassName)}
      titleClassName={titleClassName}
      descriptionClassName={descriptionClassName}
    />
  );

  if (!card) {
    const body = (
      <View className={cn("w-full", className)} {...props}>
        {content}
      </View>
    );
    if (onPress) {
      return (
        <Pressable onPress={onPress} className="active:opacity-90">
          {body}
        </Pressable>
      );
    }
    return body;
  }

  const cardNode = (
    <Card glass={glass} className={cn(toneCardClasses[tone], className)} {...props}>
      {content}
    </Card>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-90">
        {cardNode}
      </Pressable>
    );
  }

  return cardNode;
}

export type EmptyStateIconProps = {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const iconSizeClasses: Record<NonNullable<EmptyStateIconProps["size"]>, string> = {
  sm: "h-12 w-12 rounded-xl",
  md: "h-14 w-14 rounded-2xl",
  lg: "h-16 w-16 rounded-2xl",
};

/** Consistent icon container for EmptyState. */
export function EmptyStateIcon({ children, size = "md", className }: EmptyStateIconProps) {
  return (
    <View
      className={cn(
        "items-center justify-center bg-white/80 dark:bg-white/10",
        iconSizeClasses[size],
        className,
      )}
    >
      {children}
    </View>
  );
}
