"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Unlink } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api";

interface Account {
  id: number;
  bank_name: string;
  account_id: string;
  status: string;
  last_synced_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface OBAccount {
  id: number;
  bank_name: string;
  account_id: string;
  status: string;
  consent_id?: string | null;
  provider_mode: string;
  is_sandbox: boolean;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [obAccounts, setObAccounts] = useState<OBAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);
  const [syncMessages, setSyncMessages] = useState<Record<number, string>>({});
  const [syncErrors, setSyncErrors] = useState<Record<number, string>>({});
  const [pageError, setPageError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [all, ob] = await Promise.all([
        apiClient.listAccounts(),
        apiClient.listOpenBankingAccounts().catch(() => ({ accounts: [] })),
      ]);
      setAccounts(all ?? []);
      setObAccounts(ob?.accounts ?? []);
    } catch (e) {
      setAccounts([]);
      setObAccounts([]);
      setPageError(e instanceof Error ? e.message : "Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const obAccountIds = new Set(obAccounts.map((account) => account.id));
  const obById = new Map(obAccounts.map((account) => [account.id, account]));
  const isOpenBankingAccount = (accountId: number) => obAccountIds.has(accountId);

  async function pollJob(accountId: number, jobId: string) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const job = await apiClient.getJob(jobId);
      if (job.status === "succeeded") {
        const newTransactions = Number(job.result?.new_transactions ?? 0);
        setSyncMessages((messages) => ({
          ...messages,
          [accountId]: `Sync complete. Stored ${newTransactions.toLocaleString()} new transaction${newTransactions === 1 ? "" : "s"}.`,
        }));
        setSyncErrors((errors) => {
          const next = { ...errors };
          delete next[accountId];
          return next;
        });
        await load();
        return;
      }
      if (job.status === "failed") {
        throw new Error(job.error || "Open Banking sync failed.");
      }
      setSyncMessages((messages) => ({
        ...messages,
        [accountId]: job.status === "running" ? "Sync running..." : "Sync queued...",
      }));
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Open Banking sync is still running. Refresh this page to check the latest status.");
  }

  const handleSync = async (accountId: number) => {
    const useObSync = isOpenBankingAccount(accountId);
    setSyncingId(accountId);
    setSyncErrors((errors) => {
      const next = { ...errors };
      delete next[accountId];
      return next;
    });
    try {
      if (useObSync) {
        const accepted = await apiClient.fetchOpenBankingTransactions(accountId);
        setSyncMessages((messages) => ({ ...messages, [accountId]: accepted.message }));
        await pollJob(accountId, accepted.job_id);
      } else {
        await apiClient.syncAccount(accountId);
        setSyncMessages((messages) => ({ ...messages, [accountId]: "Sync complete." }));
        await load();
      }
    } catch (e) {
      setSyncErrors((errors) => ({
        ...errors,
        [accountId]: e instanceof Error ? e.message : "Sync failed.",
      }));
    } finally {
      setSyncingId(null);
    }
  };

  const handleUnlink = async (accountId: number) => {
    if (!confirm("Unlink this account? You can link again later.")) return;
    setUnlinkingId(accountId);
    setPageError(null);
    try {
      await apiClient.unlinkAccount(accountId);
      await load();
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Failed to unlink account.");
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">
            Linked bank accounts and Open Banking consents. Sync to pull latest transactions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link href="/accounts/link">Link with Open Banking</Link>
          </Button>
        </div>
      </div>

      {pageError && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{pageError}</p>
      )}

      {loading ? (
        <Card>
          <CardContent className="pt-6">Loading accounts...</CardContent>
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No accounts linked</CardTitle>
            <CardDescription>
              Link a bank account via Open Banking to sync transactions and run forensics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/accounts/link">Link with Open Banking</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => {
            const obAccount = obById.get(account.id);
            const syncLabel = obAccount
              ? `Sync ${obAccount.is_sandbox ? "Sandbox" : "Production"}`
              : "Sync";
            return (
              <Card key={account.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base">{account.bank_name}</CardTitle>
                  <span className="text-muted-foreground text-sm">{account.status}</span>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-muted-foreground text-sm font-mono">{account.account_id}</p>
                  {obAccount && (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {obAccount.is_sandbox ? "Open Banking Sandbox" : "Open Banking Production"}
                    </p>
                  )}
                  {account.last_synced_at && (
                    <p className="text-muted-foreground text-xs">
                      Last synced: {new Date(account.last_synced_at).toLocaleString()}
                    </p>
                  )}
                  {syncMessages[account.id] && (
                    <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      {syncMessages[account.id]}
                    </p>
                  )}
                  {syncErrors[account.id] && (
                    <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      {syncErrors[account.id]}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(account.id)}
                      disabled={syncingId === account.id}
                    >
                      {syncingId === account.id ? "Syncing..." : syncLabel}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnlink(account.id)}
                      disabled={unlinkingId === account.id}
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
