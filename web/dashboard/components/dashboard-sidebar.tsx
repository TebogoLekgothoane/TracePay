"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    BarChart3,
    Brain,
    Flame,
    LayoutDashboard,
    LogOut,
    Moon,
    Sun,
    BookOpen,
    ShieldCheck,
    ChevronRight,
    Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useAuth } from "@/lib/auth"

const mainNavItems = [
    {
        title: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Dashboard summary",
    },
    {
        title: "Spending Leaks",
        href: "/dashboard/history",
        icon: Flame,
        description: "Track spending patterns",

    },
    {
        title: "Insights & Trends",
        href: "/dashboard/ml-reports",
        icon: Brain,
        description: "AI-powered analysis",
    },
    {
        title: "Regional Trends",
        href: "/dashboard/regional",
        icon: BarChart3,
        description: "Geographic insights",
    },
]

const resourceItems = [
    {
        title: "Methodology Guide",
        href: "/dashboard/methodology",
        icon: BookOpen,
        description: "How we calculate scores",
    },
    {
        title: "Compliance (SARB)",
        href: "/dashboard/compliance",
        icon: ShieldCheck,
        description: "Regulatory information",
    },
]

export function DashboardSidebar() {
    const pathname = usePathname()
    const [isDarkMode, setIsDarkMode] = useState(true)
    const { logout } = useAuth()

    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode)
        document.documentElement.classList.toggle("dark")
    }

    return (
        <Sidebar
            variant="floating"
            collapsible="offcanvas"
            side="left"
            className="border-r border-border/50 bg-card/80 backdrop-blur-xl"
        >
            <SidebarHeader className="p-4">
                {/* Logo Section */}
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
                        <span className="text-xs text-muted-foreground">
                            Financial Intelligence
                        </span>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent className="px-2">
                {/* Main Navigation */}
                <SidebarGroup>
                    <SidebarGroupLabel className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                        Analytics
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu className="gap-1">
                            {mainNavItems.map((item) => {
                                const isActive = pathname === item.href
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

                                                <Badge
                                                    className="ml-auto border-transparent bg-primary/20 text-primary text-[10px] font-semibold"
                                                >

                                                </Badge>

                                                {isActive && (
                                                    <ChevronRight className="ml-auto h-4 w-4 text-primary" />
                                                )}
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarSeparator className="my-4 bg-border/50" />

                {/* Resources Section */}
                <SidebarGroup>
                    <SidebarGroupLabel className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                        Resources
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu className="gap-1">
                            {resourceItems.map((item) => {
                                const isActive = pathname === item.href
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
                                )
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {/* Pro Card */}
                {/* <div className="mx-2 mt-6 rounded-xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-4 text-primary-foreground shadow-lg shadow-primary/25">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <span className="font-semibold">TracePay Pro</span>
          </div>
          <p className="mt-2 text-xs text-primary-foreground/80">
            Unlock advanced analytics, custom reports, and priority support.
          </p>
          <button className="mt-3 w-full rounded-lg bg-white/20 px-3 py-2 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/30">
            Upgrade Now
          </button>
        </div> */}
            </SidebarContent>

            <SidebarFooter className="p-2">
                <SidebarSeparator className="mb-2 bg-border/50" />
                <SidebarMenu>
                    {/* Dark Mode Toggle */}
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

                    {/* Logout */}
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
    )
}
