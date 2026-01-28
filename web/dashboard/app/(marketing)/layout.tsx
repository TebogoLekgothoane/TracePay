import type { ReactNode } from "react";

import { SiteNavbar } from "@/components/site-navbar";

export default function MarketingLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen">
            <div className="fixed inset-x-0 top-0 z-50 bg-background/80 px-4 pt-4 pb-3 backdrop-blur-xl">
                <SiteNavbar />
            </div>
            <main className="pt-20">{children}</main>
        </div>
    );
}


