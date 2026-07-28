"use client";

import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiClient } from "@/lib/api";

type RegionalInsight = Awaited<ReturnType<typeof apiClient.getInvestorRegional>>[number];

export default function InvestorRegionalPage() {
  const [regions, setRegions] = useState<RegionalInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setRegions(await apiClient.getInvestorRegional());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load regional data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading regional data...</div>;
  }

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Regional Performance</h1>
        <p className="text-sm text-muted-foreground">
          Aggregate figures by region, no individual users.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!error && regions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No regional data yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {regions.map((region) => (
            <Card key={region.region}>
              <CardHeader>
                <CardTitle>{region.region}</CardTitle>
                <CardDescription>Avg. health score {region.average_health_score.toFixed(1)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>{region.total_leaks.toLocaleString()} leaks found</p>
                <p>{region.total_users.toLocaleString()} users</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
