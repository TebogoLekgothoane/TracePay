"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, MapPin } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { TrendBarChart, type TrendPoint } from "@/components/trend-bar-chart";
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

  const healthScorePoints: TrendPoint[] = useMemo(
    () => regions.map((region) => ({ label: region.region, value: region.average_health_score })),
    [regions]
  );

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Regional Performance</h1>
        <p className="text-sm text-muted-foreground">
          Aggregate figures by region, no individual users.
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
          Loading regional data...
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Average health score by region</CardTitle>
              <CardDescription>Higher is healthier -- score out of 100</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendBarChart
                points={healthScorePoints}
                domain={[0, 100]}
                valueLabel="Avg. health score"
                formatValue={(value) => `${value.toFixed(1)} / 100`}
                emptyIcon={MapPin}
                emptyTitle="No regional data yet"
                emptyDescription="Regional health scores will show up here once accounts across different regions start running analyses."
              />
            </CardContent>
          </Card>

          {regions.length > 0 && (
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
        </>
      )}
    </div>
  );
}
