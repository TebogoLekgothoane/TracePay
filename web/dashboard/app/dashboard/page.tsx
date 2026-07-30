"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  Download,
  FileSearch,
  Flame,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

type Overview = Awaited<ReturnType<typeof apiClient.getOverviewStats>>;
type Operations = Awaited<ReturnType<typeof apiClient.getOperationalStats>>;
type MLFindings = Awaited<ReturnType<typeof apiClient.getMLFindings>>;
type ProviderHealth = Awaited<ReturnType<typeof apiClient.getProviderHealth>>;
type AuditEntry = Awaited<ReturnType<typeof apiClient.getAuditLog>>[number];
type Period = 7 | 30 | 90;
type ChartMetric = "active_users" | "new_users" | "analyses" | "savings_identified";

const CHART_METRICS: Array<{ key: ChartMetric; label: string; color: string }> = [
  { key: "active_users", label: "Active users", color: "hsl(var(--primary))" },
  { key: "new_users", label: "New users", color: "hsl(var(--primary))" },
  { key: "analyses", label: "Analyses", color: "hsl(var(--primary))" },
  { key: "savings_identified", label: "Savings", color: "hsl(var(--primary))" },
];

function formatRand(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits,
  }).format(value);
}

function comparisonLabel(current: number, previous: number) {
  if (previous === 0) {
    return current === 0
      ? { label: "No change", positive: true }
      : { label: "New this period", positive: true };
  }
  const change = ((current - previous) / previous) * 100;
  return {
    label: `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs previous period`,
    positive: change >= 0,
  };
}

function KpiCard({
  label,
  value,
  detail,
  current,
  previous,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  current: number;
  previous: number;
  icon: typeof Users;
  tone: string;
}) {
  const comparison = comparisonLabel(current, previous);
  const TrendIcon = comparison.positive ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
          </div>
          <div className={cn("rounded-xl p-2.5", tone)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          <TrendIcon
            className={cn("h-3.5 w-3.5", comparison.positive ? "text-emerald-600" : "text-destructive")}
          />
          <span
            className={cn(
              "text-xs font-medium",
              comparison.positive ? "text-emerald-600" : "text-destructive"
            )}
          >
            {comparison.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function percent(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function formatEventName(event: string) {
  return event
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>(30);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("active_users");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [mlFindings, setMlFindings] = useState<MLFindings | null>(null);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setError(null);

    const results = await Promise.allSettled([
      apiClient.getOverviewStats(),
      apiClient.getOperationalStats(period),
      apiClient.getMLFindings(),
      apiClient.getProviderHealth(),
      apiClient.getAuditLog({ limit: 8 }),
    ]);

    const failures: string[] = [];
    const [overviewResult, operationsResult, mlResult, providerResult, auditResult] = results;

    if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
    else failures.push("platform totals");
    if (operationsResult.status === "fulfilled") setOperations(operationsResult.value);
    else failures.push("operational metrics");
    if (mlResult.status === "fulfilled") setMlFindings(mlResult.value);
    else failures.push("leak intelligence");
    if (providerResult.status === "fulfilled") setProviderHealth(providerResult.value);
    else failures.push("provider health");
    if (auditResult.status === "fulfilled") setAuditEntries(auditResult.value);
    else failures.push("audit activity");

    if (failures.length) setError(`Could not load ${failures.join(", ")}.`);
    if (results.some((result) => result.status === "fulfilled")) setLastUpdatedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportSnapshot() {
    if (!overview || !operations) return;
    const snapshot = {
      generated_at: new Date().toISOString(),
      period_days: period,
      overview,
      operations,
      leak_intelligence: mlFindings,
      provider_health: providerHealth,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tracepay-operational-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const selectedChart = CHART_METRICS.find((metric) => metric.key === chartMetric) ?? CHART_METRICS[0];
  const chartData = useMemo(
    () =>
      (operations?.daily_activity ?? []).map((point) => ({
        ...point,
        label: new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      })),
    [operations]
  );
  const activeAlerts = operations?.alerts.filter((alert) => alert.count > 0) ?? [];
  const providers = Object.entries(providerHealth?.checks ?? {});
  const funnel = operations?.funnel;
  const topLeaks = mlFindings?.top_leak_categories.slice(0, 4) ?? [];
  const maxLeakCount = Math.max(1, ...topLeaks.map((leak) => leak.count));

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <Sparkles className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading operational overview...</p>
        </div>
      </div>
    );
  }

  if (!overview || !operations) {
    return (
      <div className="p-4">
        <EmptyState
          icon={CircleAlert}
          tone="brand"
          title="Operational overview unavailable"
          description={error ?? "The dashboard could not load its required platform metrics."}
        />
      </div>
    );
  }

  const activationRate = percent(funnel?.analyzed_users ?? 0, funnel?.registered_users ?? 0);
  const linkedRate = percent(funnel?.linked_account_users ?? 0, funnel?.registered_users ?? 0);
  const returningRate = percent(funnel?.returning_active_users ?? 0, operations.active_users.current);
  const businessRate = percent(
    operations.business_accounts,
    operations.business_accounts + operations.individual_accounts
  );

  const funnelSteps = [
    { label: "Registered", value: funnel?.registered_users ?? 0, icon: Users },
    { label: "Profile complete", value: funnel?.completed_profiles ?? 0, icon: UserCheck },
    { label: "Account linked", value: funnel?.linked_account_users ?? 0, icon: Database },
    { label: "First analysis", value: funnel?.analyzed_users ?? 0, icon: FileSearch },
    { label: `Returning (${period}d)`, value: funnel?.returning_active_users ?? 0, icon: Activity },
  ];

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Operational Overview</h1>
            <Badge variant="outline">
              Live data
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Growth, activation, customer value, and platform exceptions that need attention.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Reporting period"
            value={period}
            onChange={(event) => setPeriod(Number(event.target.value) as Period)}
            className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button variant="outline" onClick={exportSnapshot}>
            <Download className="mr-2 h-4 w-4" />
            Export snapshot
          </Button>
          <Badge variant="outline" className="h-10 rounded-md px-3">
            <Clock3 className="mr-2 h-3.5 w-3.5" />
            {lastUpdatedAt
              ? lastUpdatedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
              : "Not updated"}
          </Badge>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex shrink-0 items-center gap-2 font-semibold">
              {activeAlerts.length ? (
                <ShieldAlert className="h-5 w-5 text-primary" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              )}
              {activeAlerts.some((alert) => alert.severity !== "info")
                ? "Attention required"
                : activeAlerts.length
                  ? "Items to review"
                  : "No operational exceptions"}
            </div>
            {activeAlerts.length ? (
              <div className="flex flex-1 flex-wrap gap-2">
                {activeAlerts.map((alert) => (
                  <Link
                    key={alert.key}
                    href={alert.href}
                    className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs transition-colors hover:bg-secondary/60"
                  >
                    <span className="font-semibold">{alert.count}</span>
                    <span className="text-muted-foreground">{alert.label}</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No failed connections, stalled jobs, or unresolved platform actions were detected.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="New users"
          value={operations.new_users.current.toLocaleString()}
          detail={`Registrations in the last ${period} days`}
          current={operations.new_users.current}
          previous={operations.new_users.previous}
          icon={Users}
          tone="bg-primary/10 text-primary"
        />
        <KpiCard
          label="Active users"
          value={operations.active_users.current.toLocaleString()}
          detail={`${returningRate.toFixed(1)}% were returning users`}
          current={operations.active_users.current}
          previous={operations.active_users.previous}
          icon={Activity}
          tone="bg-primary/10 text-primary"
        />
        <KpiCard
          label="Analyses completed"
          value={operations.analyses.current.toLocaleString()}
          detail={`${operations.analyses_per_active_user.toFixed(1)} per active user`}
          current={operations.analyses.current}
          previous={operations.analyses.previous}
          icon={BarChart3}
          tone="bg-primary/10 text-primary"
        />
        <KpiCard
          label="Savings identified"
          value={formatRand(operations.savings_identified.current)}
          detail={`${operations.freeze_rate.toFixed(1)}% analysis-to-freeze rate`}
          current={operations.savings_identified.current}
          previous={operations.savings_identified.previous}
          icon={Wallet}
          tone="bg-primary/10 text-primary"
        />
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Product activity</CardTitle>
            <CardDescription>Daily operating signals across the selected period</CardDescription>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
            {CHART_METRICS.map((metric) => (
              <button
                key={metric.key}
                type="button"
                onClick={() => setChartMetric(metric.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  chartMetric === metric.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {metric.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={selectedChart.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={selectedChart.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs fill-muted-foreground" />
              <YAxis tickLine={false} axisLine={false} className="text-xs fill-muted-foreground" width={54} />
              <ChartTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => [
                  chartMetric === "savings_identified" ? formatRand(Number(value), 2) : Number(value).toLocaleString(),
                  selectedChart.label,
                ]}
              />
              <Area
                type="monotone"
                dataKey={chartMetric}
                stroke={selectedChart.color}
                strokeWidth={2.5}
                fill="url(#activity-fill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Activation funnel</CardTitle>
            <CardDescription>Where product users progress—or drop out—before receiving value</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {funnelSteps.map((step, index) => {
              const previous = index === 0 ? step.value : funnelSteps[index - 1].value;
              const conversion = percent(step.value, previous);
              const totalWidth = percent(step.value, funnelSteps[0].value);
              return (
                <div key={step.label} className="grid grid-cols-[145px_1fr_72px] items-center gap-3">
                  <div className="flex items-center gap-2">
                    <step.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{step.label}</span>
                  </div>
                  <div className="h-9 overflow-hidden rounded-lg bg-muted/60">
                    <div
                      className="flex h-full min-w-[36px] items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                      style={{ width: `${Math.max(totalWidth, step.value > 0 ? 8 : 0)}%` }}
                    >
                      {step.value.toLocaleString()}
                    </div>
                  </div>
                  <span className="text-right text-xs text-muted-foreground">
                    {index === 0 ? "Baseline" : `${conversion.toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
            <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Link conversion</p>
                <p className="mt-1 text-lg font-semibold">{linkedRate.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Analysis activation</p>
                <p className="mt-1 text-lg font-semibold">{activationRate.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Business adoption</p>
                <p className="mt-1 text-lg font-semibold">{businessRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Core customer value</CardTitle>
            <CardDescription>What analyses are finding and how users act on it</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-4">
                <Gauge className="h-4 w-4 text-primary" />
                <p className="mt-3 text-2xl font-semibold">{overview.average_health_score.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Average health score</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-4">
                <Flame className="h-4 w-4 text-primary" />
                <p className="mt-3 text-2xl font-semibold">{operations.freeze_rate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Protective action rate</p>
              </div>
            </div>
            <div>
              <p className="mb-3 text-sm font-medium">Most common leak categories</p>
              {topLeaks.length ? (
                <div className="space-y-3">
                  {topLeaks.map((leak) => (
                    <div key={leak.category} className="grid grid-cols-[minmax(110px,1fr)_1.4fr_auto] items-center gap-3">
                      <span className="truncate text-xs text-muted-foreground">{leak.category}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(leak.count / maxLeakCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold">{leak.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No leak findings recorded yet.</p>
              )}
            </div>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/dashboard/history">
                Explore spending leaks
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Provider &amp; pipeline health</CardTitle>
              <CardDescription>External services and data ingestion dependencies</CardDescription>
            </div>
            <Badge
              className={cn(
                providerHealth?.status === "ok"
                  ? "bg-emerald-500/10 text-emerald-700"
                  : "bg-amber-500/10 text-amber-800"
              )}
            >
              {providerHealth?.status === "ok" ? "Healthy" : "Needs review"}
            </Badge>
          </CardHeader>
          <CardContent>
            {providers.length ? (
              <div className="space-y-3">
                {providers.map(([name, check]) => {
                  const healthy = check.status === "ok" || check.status === "configured";
                  return (
                    <div key={name} className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", healthy ? "bg-emerald-500" : "bg-amber-500")} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{formatEventName(name)}</p>
                          {check.detail && <p className="truncate text-xs text-muted-foreground">{check.detail}</p>}
                        </div>
                      </div>
                      <Badge variant="outline">{formatEventName(check.status)}</Badge>
                    </div>
                  );
                })}
                <Button variant="ghost" className="w-full" asChild>
                  <Link href="/dashboard/data-log">
                    Open data operations
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Provider health is unavailable.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Recent admin activity</CardTitle>
              <CardDescription>Latest security-sensitive and operational events</CardDescription>
            </div>
            <BriefcaseBusiness className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {auditEntries.length ? (
              <div className="space-y-1">
                {auditEntries.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 border-b border-border/50 py-3 last:border-0">
                    <div className="rounded-lg bg-muted p-2">
                      <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{formatEventName(entry.event_type)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.actor_name ?? "System"} · {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                <Button variant="ghost" className="mt-2 w-full" asChild>
                  <Link href="/dashboard/audit-log">
                    View full audit log
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
