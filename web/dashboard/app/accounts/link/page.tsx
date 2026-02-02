"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api";

export default function LinkAccountPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreateConsent = async () => {
    setCreating(true);
    setError(null);
    setAuthUrl(null);
    setConsentId(null);
    try {
      const res = await apiClient.createOpenBankingConsent({
        permissions: [
          "ReadAccountsBasic",
          "ReadTransactionsBasic",
          "ReadTransactionsCredits",
          "ReadTransactionsDebits",
        ],
        expiration_days: 90,
      });
      setConsentId(res.consent_id);
      setAuthUrl(res.authorization_url ?? null);
      if (res.authorization_url) {
        window.open(res.authorization_url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create consent");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Link account (Open Banking)</h1>
          <p className="text-muted-foreground">
            Create a consent and authorise in the bank’s page, then sync from Accounts.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/accounts">← Back to accounts</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consent &amp; authorisation</CardTitle>
          <CardDescription>
            1. Create consent below. 2. Complete authorisation in the opened tab. 3. Return to Accounts and use Sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">{error}</p>
          )}
          {consentId && (
            <p className="text-muted-foreground text-sm">
              Consent ID: <code className="rounded bg-muted px-1">{consentId}</code>
            </p>
          )}
          {authUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(authUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open authorisation page
              </Button>
              <span className="text-muted-foreground text-xs">Complete the flow in the bank’s page.</span>
            </div>
          )}
          <Button onClick={handleCreateConsent} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating consent…
              </>
            ) : (
              "Create consent and open authorisation"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
