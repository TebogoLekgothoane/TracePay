"use client";

import { PartnerSidebar } from "@/components/partner-sidebar";
import { RequireRole } from "@/components/require-role";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function PartnerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RequireRole allow={["partner", "admin"]}>
            <SidebarProvider defaultOpen={true}>
                <PartnerSidebar />
                <SidebarInset className="flex flex-col gap-4 px-4 pb-10 pt-4 md:pt-6">
                    {children}
                </SidebarInset>
            </SidebarProvider>
        </RequireRole>
    );
}
