"use client";

import { Gift, LayoutDashboard } from "lucide-react";

import { SidebarShell, type SidebarNavGroup } from "@/components/sidebar-shell";

const groups: SidebarNavGroup[] = [
    {
        label: "Partner View",
        items: [
            {
                title: "Overview",
                href: "/partner",
                icon: LayoutDashboard,
                description: "Your redemptions and commission owed",
            },
            {
                title: "Redemptions",
                href: "/partner/redemptions",
                icon: Gift,
                description: "Every redemption of your offer",
            },
        ],
    },
];

export function PartnerSidebar() {
    return <SidebarShell tagline="Partner Overview" groups={groups} />;
}
