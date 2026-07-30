"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Flame,
  MapPin,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CircularProgress } from "@/components/circular-progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api";

type Overview = Awaited<ReturnType<typeof apiClient.getInvestorOverview>>;
type Region = Awaited<ReturnType<typeof apiClient.getInvestorRegional>>[number];

function formatRand(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits,
  }).format(value);
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className={`rounded-xl p-2.5 ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressMetric({
  label,
  value,
  display,
  description,
}: {
  label: string;
  value: number;
  display: string;
  description: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="text-sm font-semibold">{display}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500"
          style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
        />
      </div>
    </div>
  );
}

export default function InvestorOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [overviewData, regionalData] = await Promise.all([
          apiClient.getInvestorOverview(),
          apiClient.getInvestorRegional().catch(() => [] as Region[]),
        ]);
        setOverview(overviewData);
        setRegions(regionalData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load investor overview.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rankedRegions = useMemo(
    () => [...regions].sort((a, b) => b.average_health_score - a.average_health_score).slice(0, 5),
    [regions]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Loading investor snapshot...
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-6 p-2 md:p-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <EmptyState
          icon={TrendingUp}
          title="No platform data yet"
          description="Growth and impact figures will show up here once accounts start linking data and running analyses."
        />
      </div>
    );
  }

  const activeRate = overview.total_users > 0
    ? (overview.active_users / overview.total_users) * 100
    : 0;
  const analysesPerUser = overview.total_users > 0
    ? overview.total_analyses / overview.total_users
    : 0;
  const savingsPerActiveUser = overview.active_users > 0
    ? overview.total_capital_protected / overview.active_users
    : 0;
  const savingsPerAnalysis = overview.total_analyses > 0
    ? overview.total_capital_protected / overview.total_analyses
    : 0;
  const freezeRate = overview.total_analyses > 0
    ? (overview.total_frozen_items / overview.total_analyses) * 100
    : 0;

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Growth &amp; Impact</h1>
            <Badge variant="outline">Current snapshot</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            A privacy-safe view of platform reach, engagement, and measurable financial impact.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/investor/regional">
            <MapPin className="mr-2 h-4 w-4" />
            Explore regions
          </Link>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-700 via-violet-600 to-fuchsia-500 text-white shadow-lg">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-24 right-48 h-56 w-56 rounded-full bg-fuchsia-300/20 blur-3xl" />
        <CardContent className="relative grid gap-8 p-6 md:grid-cols-[1.35fr_1fr] md:p-8">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white/75">
              <Wallet className="h-4 w-4" />
              Monthly savings identified
            </div>
            <p className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              {formatRand(overview.total_capital_protected, 2)}
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
              Estimated recurring costs surfaced by TracePay’s analyses across the platform.
              This is identified opportunity, not a claim of realised returns.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 self-end">
            <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs text-white/65">Per active user</p>
              <p className="mt-1 text-xl font-semibold">{formatRand(savingsPerActiveUser)}</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs text-white/65">Per analysis</p>
              <p className="mt-1 text-xl font-semibold">{formatRand(savingsPerAnalysis)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total users"
          value={overview.total_users.toLocaleString()}
          detail="Registered platform accounts"
          icon={Users}
          tone="bg-violet-500/10 text-violet-600"
        />
        <MetricCard
          label="Active users"
          value={overview.active_users.toLocaleString()}
          detail={`${activeRate.toFixed(1)}% active in the last 30 days`}
          icon={Activity}
          tone="bg-sky-500/10 text-sky-600"
        />
        <MetricCard
          label="Analyses completed"
          value={overview.total_analyses.toLocaleString()}
          detail={`${analysesPerUser.toFixed(1)} analyses per registered user`}
          icon={BarChart3}
          tone="bg-amber-500/10 text-amber-600"
        />
        <MetricCard
          label="Leaks frozen"
          value={overview.total_frozen_items.toLocaleString()}
          detail="Protective actions recorded"
          icon={ShieldCheck}
          tone="bg-emerald-500/10 text-emerald-600"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Regional performance</CardTitle>
              <CardDescription>Highest aggregate financial health scores</CardDescription>
            </div>
            <MapPin className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {rankedRegions.length === 0 ? (
              <EmptyState
                card={false}
                icon={MapPin}
                title="No regional data yet"
                description="Regional comparisons appear once enough aggregate data is available."
              />
            ) : (
              <div className="space-y-4">
                {rankedRegions.map((region, index) => (
                  <div key={region.region} className="grid grid-cols-[24px_minmax(90px,0.8fr)_2fr_auto] items-center gap-3">
                    <span className="text-xs font-semibold text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{region.region}</p>
                      <p className="text-xs text-muted-foreground">{region.total_users.toLocaleString()} users</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500"
                        style={{ width: `${Math.max(0, Math.min(region.average_health_score, 100))}%` }}
                      />
                    </div>
                    <span className="w-11 text-right text-sm font-semibold">
                      {region.average_health_score.toFixed(1)}
                    </span>
                  </div>
                ))}
                <Button variant="ghost" className="mt-2 w-full" asChild>
                  <Link href="/investor/regional">
                    View regional details
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform health</CardTitle>
            <CardDescription>Quality and engagement at a glance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-5 rounded-xl bg-muted/50 p-4">
              <CircularProgress
                value={overview.average_health_score}
                max={100}
                size={104}
                color="#7c3aed"
                label={overview.average_health_score.toFixed(1)}
                sublabel="Avg. score"
              />
              <div>
                <p className="font-semibold">Average financial health</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  The aggregate score across completed analyses, measured out of 100.
                </p>
              </div>
            </div>
            <ProgressMetric
              label="30-day activation"
              value={activeRate}
              display={`${activeRate.toFixed(1)}%`}
              description={`${overview.active_users.toLocaleString()} of ${overview.total_users.toLocaleString()} users active`}
            />
            <ProgressMetric
              label="Protective action rate"
              value={freezeRate}
              display={`${freezeRate.toFixed(1)}%`}
              description="Frozen items relative to analyses completed"
            />
          </CardContent>
        </Card>
      </div>

      <Card className="border-violet-500/20 bg-violet-500/[0.04]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="rounded-xl bg-violet-500/10 p-3 text-violet-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Investor readout</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              TracePay currently identifies {formatRand(overview.total_capital_protected)} in monthly
              savings opportunity across {overview.total_users.toLocaleString()} users.{" "}
              {overview.total_analyses.toLocaleString()} completed analyses produce an average financial
              health score of {overview.average_health_score.toFixed(1)} out of 100.
            </p>
          </div>
          <Flame className="hidden h-5 w-5 text-violet-500 sm:block" />
        </CardContent>
      </Card>
    </div>
  );
}
