"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";

type AuditEntries = Awaited<ReturnType<typeof apiClient.getAuditLog>>;

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntries>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventType, setEventType] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const data = await apiClient.getAuditLog({
          limit: 100,
          eventType: eventType.trim() || undefined,
        });
        if (!cancelled) setEntries(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the audit log.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventType]);

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Every admin action and business-sensitive event (freezes, redemptions, provisioning), newest first.
        </p>
      </div>

      <Input
        value={eventType}
        onChange={(e) => setEventType(e.target.value)}
        placeholder="Filter by event type (e.g. user_provisioned)"
        className="max-w-sm"
      />

      {error && <div className="text-sm text-destructive">{error}</div>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading audit log...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching events.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-medium">{entry.event_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {entry.actor_name ? `by ${entry.actor_name}` : "by system"}
                    {entry.target_name ? ` → ${entry.target_name}` : ""}
                    {entry.ip_address ? ` · ${entry.ip_address}` : ""}
                  </p>
                  {Object.keys(entry.metadata).length > 0 && (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
