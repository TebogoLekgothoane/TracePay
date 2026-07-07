"use client";

import { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import { Users, TrendingUp, Activity, Shield, Brain, ArrowUpRight, BarChart3 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api";
import { getCachedData, setCachedData, isCacheFresh } from "@/lib/data-cache";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type OverviewStats = {
  total_users: number;
  active_users: number;
  total_linked_accounts: number;
  total_transactions: number;
  total_analyses: number;
  average_health_score: number;
  total_frozen_items: number;
  total_capital_protected: number;
  active_consents: number;
  ml_anomalies_detected: number;
  mailbox_effect_prevalence: number;
  avg_inclusion_score: number;
  retail_wealth_unlock: number;
  avg_inclusion_delta: number;
  total_retail_velocity: number;
};

const EMPTY_STATS: OverviewStats = {
  total_users: 0,
  active_users: 0,
  total_linked_accounts: 0,
  total_transactions: 0,
  total_analyses: 0,
  average_health_score: 0,
  total_frozen_items: 0,
  total_capital_protected: 0,
  active_consents: 0,
  ml_anomalies_detected: 0,
  mailbox_effect_prevalence: 0,
  avg_inclusion_score: 0,
  retail_wealth_unlock: 0,
  avg_inclusion_delta: 0,
  total_retail_velocity: 0,
};

export default function MlReportsPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStats();
  }, []);

  async function loadStats(force = false) {
    if (isFetching) return;

    if (!force) {
      const cacheKey = "ml_reports_stats";
      if (isCacheFresh(cacheKey, 5 * 60 * 1000)) {
        const cached = getCachedData<OverviewStats>(cacheKey);
        if (cached) {
          setStats(cached);
          setLoading(false);
          return;
        }
      }
    }

    setIsFetching(true);
    setError(null);
    try {
      const overview = await apiClient.getOverviewStats();
      setStats(overview);
      setCachedData("ml_reports_stats", overview);
    } catch (e) {
      console.error("Failed to load stats:", e);
      setError("Could not load live statistics. Showing zeros until the API is available.");
      setStats(EMPTY_STATS);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8 text-primary" />
          <p className="text-muted-foreground font-medium">Loading insights…</p>
        </div>
      </div>
    );
  }

  const s = stats ?? EMPTY_STATS;

  const chartOptions: ApexOptions = {
    chart: {
      type: "area",
      toolbar: { show: false },
      background: "transparent",
      fontFamily: "inherit",
    },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2 },
    xaxis: {
      categories: ["Week 1", "Week 2", "Week 3", "Week 4"],
      labels: { style: { colors: "#64748b", fontSize: "11px" } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: "#64748b", fontSize: "11px" } },
    },
    colors: ["hsl(270, 70%, 55%)"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.08,
        stops: [0, 90, 100],
      },
    },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
    tooltip: { theme: "dark" },
  };

  const chartSeries = [
    {
      name: "Users tracked",
      data: [Math.max(0, s.total_users - 30), Math.max(0, s.total_users - 20), Math.max(0, s.total_users - 10), s.total_users],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/15 rounded-xl backdrop-blur-sm shrink-0">
                <Brain className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Insights & trends</h1>
                <p className="text-primary-foreground/80 mt-1 max-w-2xl text-sm md:text-base">
                  Platform-wide signals for partners and analysts—usage, health, and where to dig deeper.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isFetching ? (
                <Spinner className="h-5 w-5 text-primary-foreground/90" />
              ) : null}
              <span className="text-xs font-medium bg-white/20 px-3 py-1.5 rounded-full border border-white/30">
                Aggregated metrics
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8 pb-12">
        {error ? (
          <div className="rounded-xl border border-amber-500/45 bg-amber-500/10 px-4 py-3 text-sm text-foreground -mt-4 mb-2">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 -mt-12">
          <Card className="bg-card shadow-lg border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground font-medium">Users</span>
              </div>
              <div className="text-3xl font-bold text-foreground">{s.total_users.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-2">{s.active_users.toLocaleString()} active</p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-lg border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground font-medium">Linked accounts</span>
              </div>
              <div className="text-3xl font-bold text-foreground">{s.total_linked_accounts.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-2">Connections with consent</p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-lg border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-sm text-muted-foreground font-medium">Avg health</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-foreground">{Math.round(s.average_health_score)}</span>
                <span className="text-muted-foreground text-sm mb-1">/100</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Regional average score</p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-lg border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10">
                  <Shield className="w-5 h-5 text-amber-600" />
                </div>
                <span className="text-sm text-muted-foreground font-medium">Frozen items</span>
              </div>
              <div className="text-3xl font-bold text-foreground">{s.total_frozen_items.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-2">Paused or blocked outflows</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Platform growth
              </CardTitle>
              <CardDescription>Illustrative 4-week curve ending at current user total</CardDescription>
            </CardHeader>
            <CardContent>
              <Chart options={chartOptions} series={chartSeries} type="area" height={300} />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Where to go next</CardTitle>
              <CardDescription>Related dashboards</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/dashboard/regional" className="block group">
                <Card className="border border-border/60 shadow-sm transition-all hover:border-primary/30 hover:bg-secondary/40">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium group-hover:text-primary transition-colors">Regional map</div>
                      <div className="text-sm text-muted-foreground">Eastern Cape health & opportunity</div>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0" />
                  </CardContent>
                </Card>
              </Link>
              <Link href="/dashboard/data-log" className="block group">
                <Card className="border border-border/60 shadow-sm transition-all hover:border-primary/30 hover:bg-secondary/40">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium group-hover:text-primary transition-colors">Data log</div>
                      <div className="text-sm text-muted-foreground">Monitored accounts overview</div>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
