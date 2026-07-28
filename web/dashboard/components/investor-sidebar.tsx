"use client";

import { LayoutDashboard, MapPin } from "lucide-react";

import { SidebarShell, type SidebarNavGroup } from "@/components/sidebar-shell";

const groups: SidebarNavGroup[] = [
    {
        label: "Investor View",
        items: [
            {
                title: "Overview",
                href: "/investor",
                icon: LayoutDashboard,
                description: "Growth and impact metrics",
            },
            {
                title: "Regional",
                href: "/investor/regional",
                icon: MapPin,
                description: "Aggregate regional performance",
            },
        ],
    },
];

export function InvestorSidebar() {
    return <SidebarShell tagline="Investor Overview" groups={groups} />;
}
