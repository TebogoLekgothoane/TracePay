import * as React from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type EmptyStateTone = "default" | "brand" | "muted";

const toneCardClasses: Record<EmptyStateTone, string> = {
  default: "border border-dashed border-border",
  brand: "border border-dashed border-primary/30 bg-primary/5",
  muted: "border border-dashed border-border bg-muted/40",
};

const toneTitleClasses: Record<EmptyStateTone, string> = {
  default: "text-foreground",
  brand: "text-primary",
  muted: "text-foreground",
};

const toneIconWrapClasses: Record<EmptyStateTone, string> = {
  default: "bg-muted text-muted-foreground",
  brand: "bg-primary/10 text-primary",
  muted: "bg-background text-muted-foreground",
};

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title?: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: EmptyStateTone;
  /** Wrap content in a dashed card. Set false for flat sections already inside a Card. */
  card?: boolean;
}

/** Friendlier empty state (icon + title + description + optional action) --
 * mirrors the mobile app's EmptyState component so a fresh account or a
 * zero-result view never reads as a bare, unexplained blank. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  tone = "default",
  card = true,
  className,
  ...props
}: EmptyStateProps) {
  const content = (
    <div className={cn("flex flex-col items-center gap-3 text-center", card ? "py-8" : "py-6")}>
      {Icon && (
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", toneIconWrapClasses[tone])}>
          <Icon className="h-6 w-6" />
        </div>
      )}
      {title && <p className={cn("font-semibold", toneTitleClasses[tone])}>{title}</p>}
      <p className="max-w-[320px] text-sm leading-5 text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={cn("mt-1 inline-flex items-center gap-1 text-sm font-medium", toneTitleClasses[tone])}
        >
          {actionLabel}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  if (!card) {
    return (
      <div className={className} {...props}>
        {content}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl px-4", toneCardClasses[tone], className)} {...props}>
      {content}
    </div>
  );
}
