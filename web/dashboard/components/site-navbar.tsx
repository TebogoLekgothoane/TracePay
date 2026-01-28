"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-border/50 bg-background/80 px-4 py-3">
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

      <div className="flex items-center gap-1">
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

      <Link href="/register">
        <Button size="sm" className="rounded-full">
          Get Started
        </Button>
      </Link>
    </nav>
  );
}


