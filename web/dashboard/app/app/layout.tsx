"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { RequireRole } from "@/components/require-role";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function PersonalAppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RequireRole allow={["user", "admin"]}>
            <SidebarProvider defaultOpen={true}>
                <AppSidebar />
                <SidebarInset className="flex flex-col gap-4 px-4 pb-10 pt-4 md:pt-6">
                    {children}
                </SidebarInset>
            </SidebarProvider>
        </RequireRole>
    );
}
