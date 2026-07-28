"use client";

import { InvestorSidebar } from "@/components/investor-sidebar";
import { RequireRole } from "@/components/require-role";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function InvestorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RequireRole allow={["investor", "admin"]}>
            <SidebarProvider defaultOpen={true}>
                <InvestorSidebar />
                <SidebarInset className="flex flex-col gap-4 px-4 pb-10 pt-4 md:pt-6">
                    {children}
                </SidebarInset>
            </SidebarProvider>
        </RequireRole>
    );
}
