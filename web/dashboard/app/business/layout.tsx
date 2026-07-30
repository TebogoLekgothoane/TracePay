"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { BusinessSidebar } from "@/components/business-sidebar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { RequireRole } from "@/components/require-role";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";

/** An individual account with no business membership that lands here
 * directly (bookmark, typed URL) gets bounced back to /app -- only checked
 * for role "user" since admins browse /business for support/QA regardless
 * of their own account_type. Invited members pass this check too: their own
 * accountType stays "individual", but isBusinessMember is what actually
 * grants them access here. */
function BusinessGate({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const router = useRouter();
    const isIndividualAccount =
        user?.role === "user" &&
        user.onboarded &&
        user.accountType !== "business" &&
        !user.isBusinessMember;

    useEffect(() => {
        if (isIndividualAccount) {
            router.replace("/app");
        }
    }, [isIndividualAccount, router]);

    if (isIndividualAccount) {
        return null;
    }

    return (
        <>
            {children}
            {user?.role === "user" && !user.onboarded && <OnboardingModal />}
        </>
    );
}

export default function BusinessLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RequireRole allow={["user", "admin"]}>
            <SidebarProvider defaultOpen={true}>
                <BusinessSidebar />
                <SidebarInset className="flex flex-col gap-4 px-4 pb-10 pt-4 md:pt-6">
                    <BusinessGate>{children}</BusinessGate>
                </SidebarInset>
            </SidebarProvider>
        </RequireRole>
    );
}
