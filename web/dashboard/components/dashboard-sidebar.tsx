"use client";

import {
    BarChart3,
    Brain,
    Flame,
    Gift,
    LayoutDashboard,
    BookOpen,
    ScrollText,
    ShieldCheck,
    UserPlus,
} from "lucide-react";

import { SidebarShell, type SidebarNavGroup } from "@/components/sidebar-shell";

const groups: SidebarNavGroup[] = [
    {
        label: "Analytics",
        items: [
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
            {
                title: "Reward Partners",
                href: "/dashboard/partners",
                icon: Gift,
                description: "Manage commission partners",
            },
        ],
    },
    {
        label: "Administration",
        items: [
            {
                title: "Provision Account",
                href: "/dashboard/provision",
                icon: UserPlus,
                description: "Create admin/investor/partner logins",
            },
            {
                title: "Audit Log",
                href: "/dashboard/audit-log",
                icon: ScrollText,
                description: "Every sensitive platform action",
            },
        ],
    },
    {
        label: "Resources",
        items: [
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
        ],
    },
];

export function DashboardSidebar() {
    return <SidebarShell tagline="Financial Intelligence" groups={groups} />;
}
