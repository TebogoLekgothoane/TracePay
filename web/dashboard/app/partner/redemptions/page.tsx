"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Gift } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { TrendBarChart, type TrendPoint } from "@/components/trend-bar-chart";
import { apiClient } from "@/lib/api";

type Redemptions = Awaited<ReturnType<typeof apiClient.getPartnerRedemptions>>;

export default function PartnerRedemptionsPage() {
  const [redemptions, setRedemptions] = useState<Redemptions>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setRedemptions(await apiClient.getPartnerRedemptions());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load redemptions.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pointsPerDay: TrendPoint[] = useMemo(() => {
    const byDay = new Map<string, number>();
    // Redemptions arrive newest-first; walk oldest-first so same-day totals
    // accumulate in chronological order for the chart.
    for (const redemption of [...redemptions].reverse()) {
      const day = new Date(redemption.redeemed_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      byDay.set(day, (byDay.get(day) ?? 0) + redemption.points_spent);
    }
    return [...byDay.entries()].map(([label, value]) => ({ label, value }));
  }, [redemptions]);

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Redemptions</h1>
        <p className="text-sm text-muted-foreground">
          Every redemption of your offer. No customer identity is shown here — only the transaction facts.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          Loading redemptions...
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Points redeemed per day</CardTitle>
              <CardDescription>Recent activity on your offer</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendBarChart
                points={pointsPerDay}
                valueLabel="Points redeemed"
                formatValue={(value) => `${value.toLocaleString()} pts`}
                emptyIcon={Gift}
                emptyTitle="No redemptions yet"
                emptyDescription="Once someone redeems your offer, daily activity shows up here."
              />
            </CardContent>
          </Card>

          {redemptions.length === 0 && !error ? (
            <EmptyState
              icon={Gift}
              title="No redemptions yet"
              description="Once someone redeems your offer, it'll show up here with the points spent and commission owed."
            />
          ) : (
            <div className="space-y-3">
              {redemptions.map((redemption) => (
                <Card key={redemption.id}>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3">
                      <Gift className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{redemption.points_spent.toLocaleString()} pts redeemed</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(redemption.redeemed_at).toLocaleString()} &middot; {redemption.status}
                        </p>
                      </div>
                    </div>
                    <p className="font-medium">R{redemption.commission_amount.toLocaleString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
