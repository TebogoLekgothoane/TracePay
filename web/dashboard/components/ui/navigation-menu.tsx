import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

export interface NavigationMenuProps
  extends React.HTMLAttributes<HTMLElement> {
  items: NavItem[];
  rightSlot?: React.ReactNode;
}

export function NavigationMenu({
  items,
  rightSlot,
  className,
  ...props
}: NavigationMenuProps) {
  return (
    <nav
      className={cn(
        "flex h-14 items-center justify-between border-b border-border/70 bg-background/70 px-4 backdrop-blur",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-glow-primary">
          MA
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Money Autopsy
        </span>
      </div>

      <div className="flex items-center gap-6 text-sm">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-muted-foreground hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2">{rightSlot}</div>
    </nav>
  );
}


