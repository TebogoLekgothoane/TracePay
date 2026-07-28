"use client";

import { Flame, Gauge, Landmark, Settings } from "lucide-react";

import { SidebarShell, type SidebarNavGroup } from "@/components/sidebar-shell";

const groups: SidebarNavGroup[] = [
    {
        label: "My Account",
        items: [
            {
                title: "Health Score",
                href: "/app",
                icon: Gauge,
                description: "Your financial health overview",
            },
            {
                title: "My Accounts",
                href: "/app/accounts",
                icon: Landmark,
                description: "Linked bank and mobile money accounts",
            },
            {
                title: "My Leaks",
                href: "/app/leaks",
                icon: Flame,
                description: "Leaks found and frozen",
            },
            {
                title: "Account Settings",
                href: "/app/settings",
                icon: Settings,
                description: "Individual or business account",
            },
        ],
    },
];

export function AppSidebar() {
    return <SidebarShell tagline="Your Money, Traced" groups={groups} />;
}
