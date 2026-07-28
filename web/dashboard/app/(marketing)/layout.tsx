import type { ReactNode } from "react";

import { SiteNavbar } from "@/components/site-navbar";

export default function MarketingLayout({ children }: { children: ReactNode }) {
    return (
        <div className="dark relative min-h-screen text-foreground">
            <div
                aria-hidden
                className="fixed inset-0 -z-10"
                style={{
                    background:
                        "linear-gradient(135deg, hsl(285 22% 15%) 0%, hsl(262 83% 12%) 45%, hsl(248 97% 8%) 100%)",
                    backgroundAttachment: "fixed",
                }}
            />
            <div className="fixed inset-x-0 top-0 z-50 bg-background/70 px-4 pt-4 pb-3 backdrop-blur-xl">
                <SiteNavbar />
            </div>
            <main className="pt-20">{children}</main>
        </div>
    );
}


