"use client";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset className="flex flex-col gap-4 px-4 pb-10 pt-4 md:pt-6">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

