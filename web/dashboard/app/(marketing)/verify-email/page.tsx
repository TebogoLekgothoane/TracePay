"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { getSupabase } from "@/lib/supabase";

function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase confirms the email itself (via the link it emails out) and
    // redirects here with either a session already established, or an
    // error/error_description query param on failure -- there's no token
    // for this page to exchange itself.
    const linkError = searchParams.get("error_description") ?? searchParams.get("error");
    if (linkError) {
      setError(linkError);
      return;
    }

    async function checkSession() {
      const {
        data: { session },
      } = await getSupabase().auth.getSession();
      if (session) {
        setMessage("Your email has been verified.");
      } else {
        setError("This verification link is invalid or has expired.");
      }
    }

    void checkSession();
  }, [searchParams]);

  return (
    <div className="container mx-auto flex min-h-[70vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email verification</CardTitle>
          <CardDescription>Confirming your TracePay email address.</CardDescription>
        </CardHeader>
        <CardContent>
          {!message && !error && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              Verifying email...
            </div>
          )}
          {message && <p className="text-sm text-emerald-600">{message}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailStatus />
    </Suspense>
  );
}
