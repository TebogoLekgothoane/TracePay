"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, Moon, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
    useSidebar,
} from "@/components/ui/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export interface SidebarNavItem {
    title: string;
    href: string;
    icon: LucideIcon;
    description: string;
}

export interface SidebarNavGroup {
    label: string;
    items: SidebarNavItem[];
}

function SidebarToggleButton() {
    const { toggleSidebar, state } = useSidebar();
    return (
        <button
            type="button"
            onClick={toggleSidebar}
            aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
            className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-primary"
        >
            {state === "expanded" ? (
                <ChevronLeft className="h-3.5 w-3.5" />
            ) : (
                <ChevronRight className="h-3.5 w-3.5" />
            )}
        </button>
    );
}

function initialsFor(name: string, email: string): string {
    const source = name.trim() || email;
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!user) {
        return null;
    }

    function toggleDarkMode() {
        setIsDarkMode((previous) => !previous);
        document.documentElement.classList.toggle("dark");
    }

    const displayName = user.fullName || user.email;
    const initials = initialsFor(user.fullName ?? "", user.email);

    return (
        <div ref={containerRef} className="relative">
            {open && (
                <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-border bg-card p-1.5 shadow-lg">
                    <button
                        type="button"
                        onClick={toggleDarkMode}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted"
                    >
                        <span className="flex items-center gap-2">
                            {isDarkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                            {isDarkMode ? "Dark Mode" : "Light Mode"}
                        </span>
                        <span
                            className={cn(
                                "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
                                isDarkMode ? "bg-primary" : "bg-muted"
                            )}
                        >
                            <span
                                className={cn(
                                    "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                                    isDarkMode ? "translate-x-4" : "translate-x-0"
                                )}
                            />
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={logout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    >
                        <LogOut className="h-4 w-4" />
                        Log out
                    </button>
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen((previous) => !previous)}
                className={cn(
                    "flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-muted/60",
                    collapsed && "justify-center"
                )}
            >
                <Avatar
                    initials={initials}
                    className={cn("shrink-0 bg-primary/15 text-primary", collapsed ? "h-8 w-8" : "h-9 w-9")}
                />
                {!collapsed && (
                    <>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-muted-foreground">Welcome back 👋</p>
                            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </>
                )}
            </button>
        </div>
    );
}

/** Shared sidebar chrome (branding, nav groups, dark-mode toggle, logout) --
 * used by both the admin dashboard and the personal/business dashboard, each
 * passing their own nav groups rather than duplicating this structure. */
export function SidebarShell({
    tagline,
    groups,
}: {
    tagline: string;
    groups: SidebarNavGroup[];
}) {
    const pathname = usePathname();
    const { state } = useSidebar();
    const collapsed = state === "collapsed";

    return (
        <Sidebar variant="floating" collapsible="icon" side="left" className="border-none">
            <SidebarHeader className="relative p-2">
                <div
                    className={cn(
                        "flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent",
                        collapsed ? "justify-center p-1" : "p-2"
                    )}
                >
                    <div
                        className={cn(
                            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary shadow-lg shadow-primary/25",
                            collapsed ? "h-8 w-8" : "h-10 w-10"
                        )}
                    >
                        <Image src="/tracepay-logo.png" alt="TracePay" fill className="object-contain" priority />
                    </div>
                    {!collapsed && (
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate text-lg font-bold tracking-tight text-foreground">
                                TracePay
                            </span>
                            <span className="truncate text-xs text-muted-foreground">{tagline}</span>
                        </div>
                    )}
                </div>
                <SidebarToggleButton />
            </SidebarHeader>

            <SidebarContent className="px-1.5 py-1">
                {groups.map((group, groupIndex) => (
                    <div key={group.label}>
                        <SidebarMenu className="gap-1">
                            {group.items.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <SidebarMenuItem key={item.href}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={isActive}
                                            tooltip={item.description}
                                            className={cn(
                                                "group h-11 rounded-2xl transition-colors duration-200",
                                                "hover:bg-primary/10",
                                                isActive && "bg-primary/10 text-primary"
                                            )}
                                        >
                                            <Link href={item.href} className="flex items-center gap-3">
                                                <item.icon
                                                    className={cn(
                                                        "h-5 w-5 shrink-0 transition-colors",
                                                        isActive
                                                            ? "text-primary"
                                                            : "text-muted-foreground group-hover:text-primary"
                                                    )}
                                                />
                                                <span
                                                    className={cn(
                                                        "truncate font-medium",
                                                        isActive ? "text-primary" : "text-foreground"
                                                    )}
                                                >
                                                    {item.title}
                                                </span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                        {groupIndex < groups.length - 1 && (
                            <SidebarSeparator className="my-2 bg-border/50" />
                        )}
                    </div>
                ))}
            </SidebarContent>

            <SidebarFooter className="p-2">
                <SidebarSeparator className="mb-2 bg-border/50" />
                <UserMenu collapsed={collapsed} />
            </SidebarFooter>
        </Sidebar>
    );
}
