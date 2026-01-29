"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    BarChart3,
    Brain,
    Flame,
    LayoutDashboard,
    LogOut,
    Moon,
    User2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
} from "@/components/ui/sidebar";

export function DashboardSidebar() {
    const pathname = usePathname();
    const { logout } = useAuth();

    return (
        <Sidebar
            variant="floating"
            collapsible="offcanvas"  // Changed from "none"
            side="left"  // Explicitly set to left
            className="border-l-2 border-b-2 border-primary/40 bg-background/98 shadow-lg"
        >
            <SidebarHeader className="gap-2">
                {/* Logo/App Name */}
                <div className="flex items-center gap-2 px-2 py-2">
                    <div className="relative h-8 w-8 overflow-hidden rounded-lg">
                        <Image
                            src="/tracepay-logo.png"
                            alt="TracePay"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                    <span className="text-base font-semibold">TracePay</span>
                </div>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    asChild
                                    isActive={pathname === "/dashboard"}
                                    className="data-[active=true]:bg-primary/25 data-[active=true]:border-l-2 data-[active=true]:border-primary data-[active=true]:shadow-sm !hover:bg-primary/10 !hover:text-foreground"
                                >
                                    <Link href="/dashboard">
                                    <LayoutDashboard className="h-4 w-4" />
                                    <span>Overview</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton 
                                    asChild
                                    isActive={pathname === "/analysis/history"}
                                    className="data-[active=true]:bg-primary/25 data-[active=true]:border-l-2 data-[active=true]:border-primary data-[active=true]:shadow-sm !hover:bg-primary/10 !hover:text-foreground"
                                >
                                    <Link href="/analysis/history">
                                    <Flame className="h-4 w-4" />
                                        <span>Leak Analytics</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton 
                                    asChild
                                    isActive={pathname === "/admin"}
                                    className="data-[active=true]:bg-primary/25 data-[active=true]:border-l-2 data-[active=true]:border-primary data-[active=true]:shadow-sm !hover:bg-primary/10 !hover:text-foreground"
                                >
                                    <Link href="/admin">
                                        <Brain className="h-4 w-4" />
                                        <span>ML Reports</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton 
                                    asChild
                                    isActive={pathname === "/admin/regional"}
                                    className="data-[active=true]:bg-primary/25 data-[active=true]:border-l-2 data-[active=true]:border-primary data-[active=true]:shadow-sm !hover:bg-primary/10 !hover:text-foreground"
                                >
                                    <Link href="/admin/regional">
                                        <BarChart3 className="h-4 w-4" />
                                        <span>Regional Trends</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton className="w-full justify-between !hover:bg-primary/10 !hover:text-foreground">
                            <span className="flex items-center gap-2">
                                <Moon className="h-4 w-4" />
                                <span>Dark mode</span>
                            </span>
                            <Badge className="bg-primary/20 text-primary text-[10px]">On</Badge>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton 
                            className="w-full text-red-300 !hover:bg-red-500/10 !hover:text-red-300"
                            onClick={() => logout()}
                        >
                            <LogOut className="h-4 w-4" />
                            <span>Log out</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}