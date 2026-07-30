"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api";
import { useAuth, type AccountType } from "@/lib/auth";

/** Shown exactly once, the first time a never-onboarded account reaches the
 * dashboard -- forces an explicit individual-vs-business choice rather than
 * silently defaulting everyone to "individual". Not dismissable except by
 * completing the form: individual and business accounts get genuinely
 * different dashboards downstream, so this can't be skipped and fixed later
 * from a buried settings page. */
export function OnboardingModal() {
  const { refreshUser } = useAuth();
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>("individual");
  const [businessName, setBusinessName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accountType === "business" && !businessName.trim()) {
      setError("Enter your business name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.updateMyAccountSettings({
        account_type: accountType,
        business_name: accountType === "business" ? businessName.trim() : null,
      });
      await refreshUser();
      router.push(accountType === "business" ? "/business" : "/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your account type.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        hideClose
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Welcome to TracePay</DialogTitle>
          <DialogDescription>
            One quick thing before you get started — is this account for you personally, or for your
            business?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setAccountType("individual")}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                accountType === "individual"
                  ? "border-primary bg-primary/10"
                  : "border-border/60 hover:border-primary/40"
              )}
            >
              <UserIcon className="mb-2 h-5 w-5 text-muted-foreground" />
              <p className="font-medium">Individual</p>
              <p className="text-xs text-muted-foreground">Track your own money and leaks</p>
            </button>
            <button
              type="button"
              onClick={() => setAccountType("business")}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                accountType === "business"
                  ? "border-primary bg-primary/10"
                  : "border-border/60 hover:border-primary/40"
              )}
            >
              <Building2 className="mb-2 h-5 w-5 text-muted-foreground" />
              <p className="font-medium">Business</p>
              <p className="text-xs text-muted-foreground">Your business's own accounts, billed a fee</p>
            </button>
          </div>

          {accountType === "business" && (
            <div className="space-y-1.5">
              <Label htmlFor="onboarding_business_name">Business name</Label>
              <Input
                id="onboarding_business_name"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Acme Traders"
                autoFocus
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Setting up..." : "Continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
