import * as React from "react";

import { cn } from "@/lib/utils";

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  initials?: string;
}

export function Avatar({ className, initials, children, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground",
        className
      )}
      {...props}
    >
      {children ?? initials}
    </div>
  );
}


