"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  Gauge,
  Info,
  ArrowRight,
  ArrowUpRight,
  Lock,
  MapPin,
  Store,
  Target,
  TrendingUp,
  RefreshCw,
  Sparkles,
  Shield,
  Users,
  Wallet,
  Activity,
  CheckCircle2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";

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

type MLFindings = {
  top_leak_categories: Array<{ category: string; count: number; growth: string }>;
  anomaly_distribution: { high_risk: number; medium_risk: number; low_risk: number };
  predicted_savings_next_month: number;
};

type RegionalInsight = {
  region: string;
  average_health_score: number;
  total_leaks: number;
  total_users: number;
  top_leak_type: string;
};

type ProviderHealth = {
  status: string;
  checks: Record<string, { status: string; detail?: string }>;
};

const REPORTING_PERIOD_LABEL = "Last 30 days";

function formatLastUpdated(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

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

function hasAnyPlatformData(stats: OverviewStats | null): boolean {
  if (!stats) return false;
  return (
    stats.total_users > 0 ||
    stats.total_linked_accounts > 0 ||
    stats.total_transactions > 0 ||
    stats.total_analyses > 0 ||
    stats.total_frozen_items > 0
  );
}

function statusTone(status: string | undefined): string {
  if (status === "ok" || status === "configured") return "bg-accent";
  if (status === "degraded" || status === "unreachable") return "bg-amber-500";
  return "bg-muted-foreground";
}

function statusLabel(status: string | undefined): string {
  if (!status) return "Unavailable";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function DashboardPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [regional, setRegional] = useState<RegionalInsight[]>([]);
  const [mlFindings, setMlFindings] = useState<MLFindings | null>(null);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      setLoading(true);
      setError(null);

      const [statsResult, regionalResult, mlResult, healthResult] =
        await Promise.allSettled([
          apiClient.getOverviewStats(),
          apiClient.getRegionalStats(),
          apiClient.getMLFindings(),
          apiClient.getProviderHealth(),
        ]);

      if (cancelled) return;

      const failures: string[] = [];

      if (statsResult.status === "fulfilled") {
        setStats(statsResult.value);
      } else {
        setStats(null);
        failures.push("overview metrics");
      }

      if (regionalResult.status === "fulfilled") {
        setRegional(regionalResult.value);
      } else {
        setRegional([]);
        failures.push("regional metrics");
      }

      if (mlResult.status === "fulfilled") {
        setMlFindings(mlResult.value);
      } else {
        setMlFindings(null);
        failures.push("spending patterns");
      }

      if (healthResult.status === "fulfilled") {
        setProviderHealth(healthResult.value);
      } else {
        setProviderHealth(null);
        failures.push("provider health");
      }

      if (failures.length > 0) {
        setError(`Could not load ${failures.join(", ")} from the backend.`);
      }

      if (
        statsResult.status === "fulfilled" ||
        regionalResult.status === "fulfilled" ||
        mlResult.status === "fulfilled" ||
        healthResult.status === "fulfilled"
      ) {
        setLastUpdatedAt(new Date());
      }

      setLoading(false);
    }

    void loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  const getStats = useMemo(() => {
    return stats ?? EMPTY_STATS;
  }, [stats]);

  const hasPlatformData = hasAnyPlatformData(stats);
  const hasRegionalData = regional.length > 0;
  const hasMlFindings = Boolean(mlFindings?.top_leak_categories.length);
  const providerStatus = providerHealth?.status;

  const impactValue = useMemo(() => {
    return getStats.total_capital_protected;
  }, [getStats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Hero Header */}
        <div className="bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground">
          <div className="container mx-auto px-4 py-8 md:py-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                    <Target className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                      TracePay Overview
                    </h1>
                    <p className="text-primary-foreground/80 text-sm">
                      Eastern Cape Financial Health Dashboard
                    </p>
                  </div>
                </div>
                <p className="text-primary-foreground/70 text-sm max-w-xl leading-relaxed">
                  Track how TracePay helps people and businesses keep money in their pockets, strengthen financial inclusion, and boost local retail.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 backdrop-blur-sm text-sm">
                  <Activity className="h-4 w-4" />
                  <span>{REPORTING_PERIOD_LABEL}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 backdrop-blur-sm text-sm">
                  <RefreshCw className="h-4 w-4" />
                  <span>Updated {formatLastUpdated(lastUpdatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-8">
          {error && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>{error}</p>
            </div>
          )}

          {!hasPlatformData && (
            <div className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              No platform metrics are available yet. Link accounts and run transaction analyses to populate this overview.
            </div>
          )}

          {/* Key Metrics - Bento Grid */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-6">
              <h2 className="text-lg font-semibold text-foreground">At a Glance</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    Key metrics showing regional financial health, savings, inclusion, and local retail impact.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Health Score Card */}
              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Financial Health
                    </CardDescription>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Gauge className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">
                      {Math.round(getStats.average_health_score)}
                    </span>
                    <span className="text-lg text-muted-foreground">/100</span>
                  </div>
                  <div className="mt-3">
                    <Progress value={getStats.average_health_score} className="h-2" />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Average score across Eastern Cape users
                  </p>
                  <Badge className="mt-2 border-transparent text-xs bg-primary/10 text-primary hover:bg-primary/20">
                    EC Regional Average
                  </Badge>
                </CardContent>
              </Card>

              {/* Money Saved Card */}
              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Money Users Kept
                    </CardDescription>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                      <Wallet className="h-4 w-4 text-accent" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-accent">
                      R{(impactValue / 1000000).toFixed(1)}M
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Fees and waste avoided or recovered
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {hasPlatformData ? "Based on recorded analyses" : "No protected capital recorded yet"}
                  </p>
                </CardContent>
              </Card>

              {/* Credit Inclusion Card */}
              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Credit Inclusion Lift
                    </CardDescription>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <TrendingUp className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-primary">
                      +{getStats.avg_inclusion_delta}
                    </span>
                    <span className="text-lg text-muted-foreground">pts</span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Average credit score improvement
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                    <Users className="h-3 w-3" />
                    <span>{getStats.active_users.toLocaleString()} active users</span>
                  </div>
                </CardContent>
              </Card>

              {/* Local Retail Card */}
              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-secondary via-secondary/50 to-transparent shadow-sm hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Local Retail Spend
                    </CardDescription>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Store className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">
                      R{(getStats.total_retail_velocity / 1000000).toFixed(1)}M
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Redirected to EC retailers
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowUpRight className="h-3 w-3 text-accent" />
                    <span className="text-accent">Supporting local economy</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Partners & Revenue Section */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-6">
              <h2 className="text-lg font-semibold text-foreground">Partners & Revenue</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Retailer Impact */}
              <Card className="border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
                    <Store className="h-4 w-4" />
                    Retailer Impact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Retailers in the region have seen an estimated{" "}
                    <strong className="text-foreground">
                      R{getStats.total_retail_velocity.toLocaleString()}
                    </strong>{" "}
                    in purchasing power reclaimed.
                  </p>
                  <Button variant="ghost" size="sm" className="p-0 h-auto text-xs text-primary hover:bg-transparent hover:underline" asChild>
                    <Link href="/dashboard/regional">
                      View retail map <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Licensing Insights */}
              <Card className="border border-accent/20 bg-accent/5 hover:bg-accent/10 transition-colors">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-accent flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Regional Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Aggregated datasets from{" "}
                    <strong className="text-foreground">
                      {getStats.total_analyses.toLocaleString()}
                    </strong>{" "}
                    health checks available for licensing.
                  </p>
                  <Button variant="ghost" size="sm" className="p-0 h-auto text-xs text-accent hover:bg-transparent hover:underline" asChild>
                    <Link href="/dashboard/ml-reports">
                      Download insight pack <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* System Status */}
              <Card className="border border-border bg-card hover:bg-secondary/50 transition-colors">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    System Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase font-medium">
                        Data Service
                      </p>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${statusTone(providerStatus)}`} />
                        <span className="text-sm font-semibold text-foreground">
                          {statusLabel(providerStatus)}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Backend health
                    </Badge>
                  </div>
                  {providerHealth ? (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {Object.entries(providerHealth.checks).map(([name, check]) => (
                        <div key={name} className="flex items-center justify-between gap-3">
                          <span className="capitalize">{name.replaceAll("_", " ")}</span>
                          <span>{statusLabel(check.status)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Provider health is unavailable.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Two Column Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Regional Focus */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        Areas in Focus
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Eastern Cape regional health scores
                      </CardDescription>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-primary" asChild>
                    <Link href="/dashboard/regional">
                      View all <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {hasRegionalData ? (
                  <div className="space-y-5">
                    {regional.map((reg, index) => (
                      <div key={reg.region} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {index + 1}
                            </div>
                            <span className="text-sm font-medium text-foreground">
                              {reg.region}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {reg.average_health_score}
                            </span>
                            <span className="text-xs text-muted-foreground">/100</span>
                          </div>
                        </div>
                        <div className="relative">
                          <Progress
                            value={reg.average_health_score}
                            className="h-2"
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{reg.total_users.toLocaleString()} users</span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive/60" />
                            Top issue: {reg.top_leak_type}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    No regional metrics are available yet.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Spending Patterns */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Brain className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Spending Patterns
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Categories with most activity
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {hasMlFindings && mlFindings ? (
                  <div className="space-y-4">
                    {mlFindings.top_leak_categories.map((leak, index) => (
                      <div
                        key={leak.category}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {leak.category}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {leak.count.toLocaleString()} occurrences
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            leak.growth.startsWith("+")
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : "border-accent/30 bg-accent/10 text-accent"
                          }
                        >
                          {leak.growth}
                        </Badge>
                      </div>
                    ))}

                    <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Predicted Savings (Next 30 Days)
                          </span>
                        </div>
                        <span className="text-xl font-bold text-primary">
                          R{mlFindings.predicted_savings_next_month.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    No spending pattern findings are available yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Footer Stats */}
          <section className="mt-10 pt-8 border-t border-border">
            <div className="flex flex-wrap items-center justify-center gap-8 text-center">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <span className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{getStats.total_users.toLocaleString()}</strong> total users
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <span className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{getStats.total_linked_accounts.toLocaleString()}</strong> linked accounts
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <span className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{getStats.total_transactions.toLocaleString()}</strong> transactions analyzed
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{getStats.active_consents.toLocaleString()}</strong> active consents
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}
