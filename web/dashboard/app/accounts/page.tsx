"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ExternalLink, Unlink } from "lucide-react";
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
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [obAccounts, setObAccounts] = useState<OBAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, ob] = await Promise.all([
        apiClient.listAccounts(),
        apiClient.listOpenBankingAccounts().catch(() => ({ accounts: [] })),
      ]);
      setAccounts(all ?? []);
      setObAccounts(ob?.accounts ?? []);
    } catch {
      setAccounts([]);
      setObAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const obAccountIds = new Set(obAccounts.map((a) => a.id));
  const isOpenBankingAccount = (accountId: number) => obAccountIds.has(accountId);

  const handleSync = async (accountId: number) => {
    const useObSync = isOpenBankingAccount(accountId);
    setSyncingId(accountId);
    try {
      if (useObSync) {
        await apiClient.fetchOpenBankingTransactions(accountId);
      } else {
        await apiClient.syncAccount(accountId);
      }
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingId(null);
    }
  };

  const handleUnlink = async (accountId: number) => {
    if (!confirm("Unlink this account? You can link again later.")) return;
    setUnlinkingId(accountId);
    try {
      await apiClient.unlinkAccount(accountId);
      await load();
    } catch (e) {
      console.error(e);
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
            <Link href="/accounts/link">
              Link with Open Banking
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="pt-6">Loading accounts…</CardContent>
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
          {accounts.map((acc) => (
              <Card key={acc.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base">{acc.bank_name}</CardTitle>
                  <span className="text-muted-foreground text-sm">{acc.status}</span>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-muted-foreground text-sm font-mono">{acc.account_id}</p>
                  {acc.last_synced_at && (
                    <p className="text-muted-foreground text-xs">
                      Last synced: {new Date(acc.last_synced_at).toLocaleString()}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(acc.id)}
                      disabled={syncingId === acc.id}
                    >
                      {syncingId === acc.id ? "Syncing…" : isOpenBankingAccount(acc.id) ? "Sync (OB)" : "Sync"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnlink(acc.id)}
                      disabled={unlinkingId === acc.id}
                    >
                      <Unlink className="h-4 w-4" />
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
