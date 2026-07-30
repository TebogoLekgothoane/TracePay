"use client";

import { Building2, Flame, Landmark, Settings, Users } from "lucide-react";

import { SidebarShell, type SidebarNavGroup } from "@/components/sidebar-shell";
import { useAuth } from "@/lib/auth";

export function BusinessSidebar() {
    const { user } = useAuth();
    const isOwner = !user?.isBusinessMember;

    const groups: SidebarNavGroup[] = [
        {
            label: "Business",
            items: [
                {
                    title: "Business Health",
                    href: "/business",
                    icon: Building2,
                    description: "Your business's financial health overview",
                },
                {
                    title: "Linked Accounts",
                    href: "/business/accounts",
                    icon: Landmark,
                    description: "Bank and mobile money accounts across your business",
                },
                {
                    title: "Leaks",
                    href: "/business/leaks",
                    icon: Flame,
                    description: "Leaks found and frozen",
                },
                // Team management and account settings are owner-only --
                // hidden for invited staff rather than shown and then 403ing.
                ...(isOwner
                    ? [
                        {
                            title: "Team",
                            href: "/business/team",
                            icon: Users,
                            description: "Invite and manage staff access",
                        },
                        {
                            title: "Account Settings",
                            href: "/business/settings",
                            icon: Settings,
                            description: "Business details and account type",
                        },
                    ]
                    : []),
            ],
        },
    ];

    return <SidebarShell tagline="Business, Traced" groups={groups} />;
}
