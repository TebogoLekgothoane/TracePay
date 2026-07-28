"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", hint: "Full TracePay admin dashboard access" },
  { value: "investor", label: "Investor", hint: "Curated growth & impact view" },
  { value: "partner", label: "Partner", hint: "Redemption view — link an owner on the Reward Partners page after" },
  { value: "user", label: "User", hint: "A regular individual/business account" },
] as const;

type Role = (typeof ROLE_OPTIONS)[number]["value"];

export default function ProvisionAccountPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("investor");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; email: string; role: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreated(null);
    try {
      const result = await apiClient.provisionUser({ email: email.trim().toLowerCase(), role });
      setCreated(result);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not provision that account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Provision Account</h1>
        <p className="text-sm text-muted-foreground">
          Admin, investor, and partner accounts have no self-service signup — this is the only way to
          create one. The invitee gets an email with a magic link to set their own password.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {created && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>
              Invited <span className="font-medium">{created.email}</span> as {created.role}.
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{created.id}</p>
            {created.role === "partner" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Paste this id as the owner on the Reward Partners page to link their login.
              </p>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite a new account</CardTitle>
          <CardDescription>Sends a magic-link email via Supabase Auth</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@example.com"
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Role</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRole(option.value)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                      role === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <p className="font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={submitting || !email.trim()} className="sm:col-span-2 sm:justify-self-start">
              {submitting ? "Inviting..." : "Send invite"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
