"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";

/**
 * Gates its children to a set of allowed profile roles. Signed-out visitors
 * are redirected to sign-in; signed-in visitors with the wrong role see an
 * explanation instead of a silent 403 or an empty page (which is what every
 * page under /dashboard did before this existed -- the API would reject the
 * request, but the page itself never knew or said why).
 */
export function RequireRole({
  allow,
  children,
}: {
  allow: string[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/sign-in");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!allow.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-lg font-semibold">
          This view isn&apos;t available for your account yet
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your account role is &ldquo;{user.role}&rdquo;. This section is
          currently limited to TracePay admins.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
