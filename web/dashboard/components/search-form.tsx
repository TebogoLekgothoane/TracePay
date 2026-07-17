"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function SearchForm({ className, ...props }: React.ComponentProps<"form">) {
  return (
    <form
      {...props}
      className={cn("w-full", className)}
      onSubmit={(e) => e.preventDefault()}
    >
      <Label htmlFor="sidebar-search" className="sr-only">
        Search
      </Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="sidebar-search"
          type="search"
          placeholder="Search pages…"
          className="h-8 w-full bg-background/80 pl-8 text-xs"
        />
      </div>
    </form>
  );
}
