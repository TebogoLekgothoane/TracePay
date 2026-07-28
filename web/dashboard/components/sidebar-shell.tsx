"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Moon, Sun, ChevronRight, type LucideIcon } from "lucide-react";
import { useState } from "react";

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
} from "@/components/ui/sidebar";
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
    const [isDarkMode, setIsDarkMode] = useState(true);
    const { logout } = useAuth();

    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode);
        document.documentElement.classList.toggle("dark");
    };

    return (
        <Sidebar
            variant="floating"
            collapsible="offcanvas"
            side="left"
            className="border-r border-border/50 bg-card/80 backdrop-blur-xl"
        >
            <SidebarHeader className="p-4">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3">
                    <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary shadow-lg shadow-primary/25">
                        <Image
                            src="/tracepay-logo.png"
                            alt="TracePay"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg font-bold tracking-tight text-foreground">
                            TracePay
                        </span>
                        <span className="text-xs text-muted-foreground">{tagline}</span>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent className="px-2">
                {groups.map((group, groupIndex) => (
                    <div key={group.label}>
                        <SidebarGroup>
                            <SidebarGroupLabel className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                                {group.label}
                            </SidebarGroupLabel>
                            <SidebarGroupContent>
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
                                                        "group relative h-11 rounded-xl transition-all duration-200",
                                                        "hover:bg-primary/10 hover:text-foreground",
                                                        isActive && [
                                                            "bg-primary/15 text-primary",
                                                            "before:absolute before:left-0 before:top-1/2 before:h-6 before:-translate-y-1/2",
                                                            "before:w-1 before:rounded-full before:bg-primary",
                                                            "shadow-sm shadow-primary/10",
                                                        ]
                                                    )}
                                                >
                                                    <Link href={item.href} className="flex items-center gap-3">
                                                        <item.icon
                                                            className={cn(
                                                                "h-5 w-5 transition-colors",
                                                                isActive
                                                                    ? "text-primary"
                                                                    : "text-muted-foreground group-hover:text-primary"
                                                            )}
                                                        />
                                                        <span
                                                            className={cn(
                                                                "font-medium",
                                                                isActive ? "text-primary" : "text-foreground"
                                                            )}
                                                        >
                                                            {item.title}
                                                        </span>
                                                        {isActive && (
                                                            <ChevronRight className="ml-auto h-4 w-4 text-primary" />
                                                        )}
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        );
                                    })}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                        {groupIndex < groups.length - 1 && (
                            <SidebarSeparator className="my-4 bg-border/50" />
                        )}
                    </div>
                ))}
            </SidebarContent>

            <SidebarFooter className="p-2">
                <SidebarSeparator className="mb-2 bg-border/50" />
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            onClick={toggleDarkMode}
                            className="group h-11 rounded-xl transition-all duration-200 hover:bg-primary/10"
                        >
                            <div className="flex w-full items-center justify-between">
                                <span className="flex items-center gap-3">
                                    {isDarkMode ? (
                                        <Moon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                                    ) : (
                                        <Sun className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                                    )}
                                    <span className="font-medium text-foreground">
                                        {isDarkMode ? "Dark Mode" : "Light Mode"}
                                    </span>
                                </span>
                                <div
                                    className={cn(
                                        "flex h-6 w-11 items-center rounded-full p-1 transition-colors",
                                        isDarkMode ? "bg-primary" : "bg-muted"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                                            isDarkMode ? "translate-x-5" : "translate-x-0"
                                        )}
                                    />
                                </div>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton
                            className="group h-11 rounded-xl text-destructive transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
                            onClick={logout}
                        >
                            <LogOut className="h-5 w-5" />
                            <span className="font-medium">Log out</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
