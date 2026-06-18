import React from "react";
import { View, Text, type ViewProps } from "react-native";

import { cn } from "@/lib/cn";

export type CardProps = ViewProps & {
  className?: string;
};

export function Card({ className, children, ...props }: CardProps) {
  return (
    <View
      className={cn("rounded-[32px] bg-transparent p-5", className)}
      {...props}
    >
      {children}
    </View>
  );
}

export type IconCardProps = Omit<CardProps, "children"> & {
  icon: React.ReactNode;
  title: string;
  description: string;
  contentClassName?: string;
};

export function IconCard({
  icon,
  title,
  description,
  className,
  contentClassName,
  ...props
}: IconCardProps) {
  return (
    <Card className={cn("flex-row", className)} {...props}>
      {icon}
      <View className={cn("ml-4 flex-1", contentClassName)}>
        <Text className="text-[17px] font-semibold text-foreground">{title}</Text>
        <Text className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </Text>
      </View>
    </Card>
  );
}
