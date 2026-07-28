"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Landmark, RefreshCw, Trash2 } from "lucide-react";

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

type Account = Awaited<ReturnType<typeof apiClient.listAccounts>>[number];

export default function MyAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState<number | null>(null);

  async function load() {
    try {
      setError(null);
      setAccounts(await apiClient.listAccounts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.linkAccount({ bank_name: bankName });
      setBankName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link that account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSync(accountId: number) {
    setBusyAccountId(accountId);
    setError(null);
    try {
      await apiClient.syncAccount(accountId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync that account.");
    } finally {
      setBusyAccountId(null);
    }
  }

  async function handleUnlink(accountId: number) {
    setBusyAccountId(accountId);
    setError(null);
    try {
      await apiClient.unlinkAccount(accountId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlink that account.");
    } finally {
      setBusyAccountId(null);
    }
  }

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Bank and mobile money accounts linked for leak detection.
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
          <CardTitle>Link a new account</CardTitle>
          <CardDescription>e.g. Standard Bank, FNB, Capitec, MTN MoMo</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLink} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="bank_name">Bank / provider name</Label>
              <Input
                id="bank_name"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                placeholder="MTN MoMo"
                required
              />
            </div>
            <Button type="submit" disabled={submitting || !bankName.trim()}>
              {submitting ? "Linking..." : "Link account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your accounts...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No accounts linked yet. Add one above to start tracing your leaks.
        </p>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <Landmark className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{account.bank_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {account.last_synced_at
                        ? `Last synced ${new Date(account.last_synced_at).toLocaleString()}`
                        : "Never synced"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAccountId === account.id}
                    onClick={() => handleSync(account.id)}
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Sync
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyAccountId === account.id}
                    onClick={() => handleUnlink(account.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
