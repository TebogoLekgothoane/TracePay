"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api";

function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      if (!token) {
        setError("This verification link is missing a token.");
        return;
      }
      try {
        const response = await apiClient.confirmEmailVerification(token);
        setMessage(response.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not verify email.");
      }
    }

    void verify();
  }, [token]);

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
