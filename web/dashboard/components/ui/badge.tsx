import * as React from "react";

import { cn } from "@/lib/utils";

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outline";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variant === "default" &&
        "border-transparent bg-secondary/80 text-secondary-foreground",
        variant === "outline" &&
        "border-border/70 bg-transparent text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}


