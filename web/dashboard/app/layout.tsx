import "./globals.css";

import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
    title: "TracePay",
    description:
        "Next-gen finance forensics for everyday life. Built for the 2026 FinTech Summer School Hackathon.",
    icons: {
        icon: "/tracepay-logo.png",
        shortcut: "/tracepay-logo.png",
        apple: "/tracepay-logo.png",
    },
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body className="min-h-screen bg-background text-foreground antialiased">
                {children}
            </body>
        </html>
    );
}
