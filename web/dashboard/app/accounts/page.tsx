"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Account {
  id: number;
  bank_name: string;
  account_id: string;
  status: string;
  last_synced_at: string | null;
  created_at: string;
  metadata: Record<string, any>;
}

export default function AccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      loadAccounts();
    }
  }, [user]);

  async function loadAccounts() {
    try {
      const data = await apiClient.listAccounts();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to load accounts:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync(accountId: number) {
    setSyncing(accountId);
    try {
      await apiClient.syncAccount(accountId);
      await loadAccounts();
    } catch (error) {
      console.error("Failed to sync account:", error);
    } finally {
      setSyncing(null);
    }
  }

  async function handleUnlink(accountId: number) {
    if (!confirm("Are you sure you want to unlink this account?")) return;

    try {
      await apiClient.unlinkAccount(accountId);
      await loadAccounts();
    } catch (error) {
      console.error("Failed to unlink account:", error);
    }
  }

  if (loading) {
    return <div className="p-8">Loading accounts...</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Linked Accounts</h1>
          <p className="text-muted-foreground">Manage your connected bank accounts</p>
        </div>
        <Link href="/accounts/link">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Link Account
          </Button>
        </Link>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">No accounts linked yet</p>
            <Link href="/accounts/link">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Link Your First Account
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <CardTitle>{account.bank_name}</CardTitle>
                <CardDescription>
                  {account.account_id.substring(0, 20)}...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status:</span>
                    <span className={account.status === "active" ? "text-green-400" : "text-yellow-400"}>
                      {account.status}
                    </span>
                  </div>
                  {account.last_synced_at && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last synced:</span>
                      <span>{new Date(account.last_synced_at).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(account.id)}
                      disabled={syncing === account.id}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${syncing === account.id ? "animate-spin" : ""}`} />
                      Sync
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleUnlink(account.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Unlink
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

