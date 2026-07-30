"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, Landmark, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

type Account = Awaited<ReturnType<typeof apiClient.listBusinessAccounts>>[number];

const UNASSIGNED_LABEL = "Unassigned";

export default function BusinessAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [branchLabel, setBranchLabel] = useState("");
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState<number | null>(null);
  const [branchDrafts, setBranchDrafts] = useState<Record<number, string>>({});

  async function load() {
    try {
      setError(null);
      setAccounts(await apiClient.listBusinessAccounts());
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
    setLinkError(null);
    try {
      await apiClient.linkBusinessAccount({
        bank_name: bankName,
        branch_label: branchLabel.trim() || null,
      });
      setBankName("");
      setBranchLabel("");
      await load();
      setLinkModalOpen(false);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not link that account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSync(accountId: number) {
    setBusyAccountId(accountId);
    setError(null);
    try {
      await apiClient.syncBusinessAccount(accountId);
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
      await apiClient.unlinkBusinessAccount(accountId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlink that account.");
    } finally {
      setBusyAccountId(null);
    }
  }

  async function handleRetagBranch(accountId: number) {
    const draft = branchDrafts[accountId] ?? "";
    setBusyAccountId(accountId);
    setError(null);
    try {
      await apiClient.updateBusinessAccountBranch(accountId, draft.trim() || null);
      await load();
      setBranchDrafts((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that account's branch.");
    } finally {
      setBusyAccountId(null);
    }
  }

  const branchGroups = useMemo(() => {
    const groups = new Map<string, Account[]>();
    for (const account of accounts) {
      const key = account.branch_label?.trim() || UNASSIGNED_LABEL;
      const list = groups.get(key) ?? [];
      list.push(account);
      groups.set(key, list);
    }
    // Unassigned last -- branches a business actually named are the point.
    return [...groups.entries()].sort((a, b) => {
      if (a[0] === UNASSIGNED_LABEL) return 1;
      if (b[0] === UNASSIGNED_LABEL) return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [accounts]);

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Linked Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Bank and mobile money accounts linked across your business for leak detection. Tag each one
            with a branch or department to see how they group.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setLinkModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Link account
        </Button>
      </div>

      <Dialog
        open={linkModalOpen}
        onOpenChange={(open) => {
          if (submitting) return;
          setLinkModalOpen(open);
          if (!open) {
            setBankName("");
            setBranchLabel("");
            setLinkError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link a new account</DialogTitle>
            <DialogDescription>
              Add a bank or mobile money account and optionally assign it to a branch or department.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLink} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bank_name">Bank / provider name</Label>
              <Input
                id="bank_name"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                placeholder="e.g. Standard Bank, FNB, MTN MoMo"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch_label">Branch / department (optional)</Label>
              <Input
                id="branch_label"
                value={branchLabel}
                onChange={(event) => setBranchLabel(event.target.value)}
                placeholder="Cape Town Store"
              />
            </div>
            {linkError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {linkError}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setLinkModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !bankName.trim()}>
                {submitting ? "Linking..." : "Link account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your accounts...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No accounts linked yet. Link one to start tracing leaks across your business.
        </p>
      ) : (
        <div className="space-y-6">
          {branchGroups.map(([branch, branchAccounts]) => (
            <div key={branch} className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">{branch}</h2>
                <span className="text-xs text-muted-foreground">
                  {branchAccounts.length} account{branchAccounts.length === 1 ? "" : "s"}
                </span>
              </div>
              {branchAccounts.map((account) => (
                <Card key={account.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={branchDrafts[account.id] ?? account.branch_label ?? ""}
                        onChange={(event) =>
                          setBranchDrafts((prev) => ({ ...prev, [account.id]: event.target.value }))
                        }
                        placeholder="Unassigned"
                        className="h-8 w-40 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyAccountId === account.id || !(account.id in branchDrafts)}
                        onClick={() => handleRetagBranch(account.id)}
                      >
                        Save
                      </Button>
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
          ))}
        </div>
      )}
    </div>
  );
}
