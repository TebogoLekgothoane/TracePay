"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/team", label: "The Team" },
  { href: "/register", label: "Register" },
  { href: "/sign-in", label: "Sign In" },
];

export function SiteNavbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative mx-auto max-w-6xl">
      <nav className="flex items-center justify-between rounded-full border border-border/50 bg-background/80 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-background">
            <Image
              src="/tracepay-logo.png"
              alt="TracePay"
              fill
              className="object-contain"
              priority
            />
          </div>
          <span className="hidden text-sm font-semibold sm:inline">TracePay</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link href="/register" className="hidden sm:block">
            <Button size="sm" className="rounded-full">
              Get Started
            </Button>
          </Link>

          <button
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 hover:bg-secondary/60 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 flex flex-col gap-1 rounded-2xl border border-border/50 bg-background/95 p-3 shadow-glow-card backdrop-blur-xl lg:hidden">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              <button
                className={cn(
                  "w-full rounded-lg px-4 py-3 text-left text-base font-medium transition-colors",
                  pathname === item.href
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            </Link>
          ))}
          <Link href="/register" onClick={() => setOpen(false)} className="mt-1 sm:hidden">
            <Button className="w-full rounded-full">Get Started</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
