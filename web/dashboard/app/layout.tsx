import "./globals.css";

import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-sans",
    display: "swap",
});

const fraunces = Fraunces({
    subsets: ["latin"],
    variable: "--font-display",
    style: ["normal", "italic"],
    axes: ["opsz", "SOFT", "WONK"],
    display: "swap",
});

const plexMono = IBM_Plex_Mono({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    variable: "--font-mono",
    display: "swap",
});

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
        <html
            lang="en"
            className={`${inter.variable} ${fraunces.variable} ${plexMono.variable}`}
        >
            <body className="min-h-screen bg-background text-foreground antialiased font-sans">
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}
