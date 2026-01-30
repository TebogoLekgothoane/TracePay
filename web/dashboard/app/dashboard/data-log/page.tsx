"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { getCachedData, setCachedData, isCacheFresh } from "@/lib/data-cache";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const limit = 50;

  useEffect(() => {
    void loadUsers();
  }, [skip]);

  async function loadUsers(force = false) {
    // Check cache first if not forcing refresh (only cache first page)
    if (!force && skip === 0) {
      const cacheKey = "data_log_users";
      if (isCacheFresh(cacheKey, 5 * 60 * 1000)) {
        const cached = getCachedData<{ users: any[], total: number }>(cacheKey);
        if (cached) {
          setUsers(cached.users);
          setTotal(cached.total);
          setLoading(false);
          return;
        }
      }
    }

    try {
      const data = await apiClient.listUsers(skip, limit);
      setUsers(data.users);
      setTotal(data.total);
      // Only cache first page
      if (skip === 0) {
        setCachedData("data_log_users", data);
      }
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-primary font-medium">Loading Data Logs...</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Forensic Data Log</h1>
        <p className="text-muted-foreground">Detailed history of platform-wide data ingestion and monitoring</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monitored Entities ({total})</CardTitle>
          <CardDescription>Aggregate list of all identities currently being monitored for leakages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <div className="font-medium">{u.email}</div>
                  <div className="text-sm text-muted-foreground">
                    Profile: {u.role === 'admin' ? 'Lead Analyst' : 'Standard Monitor'} • Established: {new Date(u.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className={u.is_active ? "text-green-400" : "text-red-400"}>
                  {u.is_active ? "Data Pipeline: ACTIVE" : "Data Pipeline: INACTIVE"}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => setSkip(Math.max(0, skip - limit))}
              disabled={skip === 0}
              className="rounded-md border px-4 py-2 disabled:opacity-50 text-xs font-medium"
            >
              Previous Period
            </button>
            <span className="text-xs text-muted-foreground">
              Ingestion Log {skip + 1}-{Math.min(skip + limit, total)} of {total}
            </span>
            <button
              onClick={() => setSkip(skip + limit)}
              disabled={skip + limit >= total}
              className="rounded-md border px-4 py-2 disabled:opacity-50 text-xs font-medium"
            >
              Next Period
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

