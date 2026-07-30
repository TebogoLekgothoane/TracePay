"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Flame, Snowflake } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiClient } from "@/lib/api";

type Analysis = Awaited<ReturnType<typeof apiClient.getBusinessAnalyses>>[number];
type FrozenItem = Awaited<ReturnType<typeof apiClient.listBusinessFrozen>>[number];

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-500/15 text-red-500",
  medium: "bg-amber-500/15 text-amber-500",
  low: "bg-emerald-500/15 text-emerald-500",
};

export default function BusinessLeaksPage() {
  const [latest, setLatest] = useState<Analysis | null>(null);
  const [frozen, setFrozen] = useState<FrozenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyLeakId, setBusyLeakId] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const [analyses, frozenItems] = await Promise.all([
        apiClient.getBusinessAnalyses(1),
        apiClient.listBusinessFrozen(),
      ]);
      setLatest(analyses[0] ?? null);
      setFrozen(frozenItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your business's leaks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const frozenLeakIds = useMemo(
    () => new Set(frozen.map((item) => item.leak_id).filter(Boolean)),
    [frozen]
  );

  async function handleFreeze(leak: Analysis["money_leaks"][number]) {
    const leakId = leak.id ?? leak.title ?? "unknown";
    setBusyLeakId(leakId);
    setError(null);
    try {
      await apiClient.freezeBusinessLeak({
        leak_id: leakId,
        reason: leak.title ? `Freeze: ${leak.title}` : "Freeze requested from web dashboard",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not freeze that leak.");
    } finally {
      setBusyLeakId(null);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading your business's leaks...</div>;
  }

  const leaks = latest?.money_leaks ?? [];

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leaks</h1>
        <p className="text-sm text-muted-foreground">
          {latest
            ? `Vendor fees, unused subscriptions, and recurring costs from your last analysis, ${new Date(latest.created_at).toLocaleDateString()}`
            : "Run an analysis from the Business Health page to see leaks here."}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {leaks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leaks found in your business's latest analysis.</p>
      ) : (
        <div className="space-y-3">
          {leaks.map((leak, index) => {
            const leakId = leak.id ?? leak.title ?? `leak-${index}`;
            const isFrozen = frozenLeakIds.has(leakId);
            return (
              <Card key={leakId}>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="flex items-start gap-3">
                    <Flame className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{leak.title ?? "Leak"}</p>
                        {leak.severity && (
                          <Badge className={SEVERITY_STYLES[leak.severity] ?? ""}>
                            {leak.severity}
                          </Badge>
                        )}
                      </div>
                      {typeof leak.estimated_monthly_cost === "number" && (
                        <p className="text-xs text-muted-foreground">
                          ~R{leak.estimated_monthly_cost.toFixed(2)} / month
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isFrozen ? "ghost" : "outline"}
                    disabled={isFrozen || busyLeakId === leakId}
                    onClick={() => handleFreeze(leak)}
                  >
                    <Snowflake className="mr-2 h-3.5 w-3.5" />
                    {isFrozen ? "Frozen" : "Freeze"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Frozen</CardTitle>
          <CardDescription>Leaks you've stopped. Nothing here reverses automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          {frozen.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing frozen yet.</p>
          ) : (
            <div className="space-y-2">
              {frozen.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <span>{item.reason}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.frozen_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
