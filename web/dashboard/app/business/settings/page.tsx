"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api";
import { homeRouteForUser, useAuth, type AccountType } from "@/lib/auth";

export default function BusinessSettingsPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>("business");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiClient.getMyAccountSettings();
        setAccountType(data.account_type);
        setBusinessName(data.business_name ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load account settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiClient.updateMyAccountSettings({
        account_type: accountType,
        business_name: accountType === "business" ? businessName.trim() || null : null,
      });
      await refreshUser();
      setSaved(true);
      // Switching to individual moves the account off the business
      // dashboard entirely -- send them to wherever they now belong.
      if (accountType === "individual") {
        router.push(
          homeRouteForUser({ role: user?.role ?? "user", accountType, isBusinessMember: false })
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save account settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading account settings...</div>;
  }

  if (user?.isBusinessMember) {
    return (
      <div className="p-2 md:p-4">
        <EmptyState
          icon={Lock}
          title="Owner only"
          description="Only the business account owner can change these settings. Ask them if something needs to change."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your business name and account type.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account type</CardTitle>
          <CardDescription>Free for individuals. Business accounts are billed a fee.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["individual", "business"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAccountType(type)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    accountType === type
                      ? "border-primary bg-primary/10"
                      : "border-border/60 hover:border-primary/40"
                  )}
                >
                  <p className="font-medium capitalize">{type}</p>
                  <p className="text-xs text-muted-foreground">
                    {type === "individual"
                      ? "Personal accounts and transactions"
                      : "Your business's own accounts and transactions"}
                  </p>
                </button>
              ))}
            </div>

            {accountType === "business" && (
              <div className="space-y-1.5">
                <Label htmlFor="business_name">Business name</Label>
                <Input
                  id="business_name"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  placeholder="Acme Traders"
                />
              </div>
            )}

            {accountType === "individual" && (
              <p className="text-xs text-muted-foreground">
                Switching to individual will move you to the personal dashboard.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-sm text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
