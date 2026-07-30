"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Building2, Flame, Landmark, ShieldCheck, Sparkles, TrendingUp, Wallet } from "lucide-react";

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
import { CircularProgress } from "@/components/circular-progress";
import { TrendBarChart, type TrendPoint } from "@/components/trend-bar-chart";
import { LeakBreakdownDonut, type DonutSegment } from "@/components/leak-breakdown-donut";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Summary = Awaited<ReturnType<typeof apiClient.getBusinessSummary>>;
type Analysis = Awaited<ReturnType<typeof apiClient.getBusinessAnalyses>>[number];
type Account = Awaited<ReturnType<typeof apiClient.listBusinessAccounts>>[number];

const UNASSIGNED_BRANCH_LABEL = "Unassigned";

// A small, clearly-labeled sample dataset so a new business account can see
// the pipeline work end to end without needing a real linked bank/MoMo sync
// (Open Banking sandbox credentials aren't configured in this environment).
const SAMPLE_TRANSACTIONS = [
  { id: "sample-1", timestamp: "2026-07-01T08:00:00Z", amount: -450, currency: "ZAR", description: "SaaS subscription", merchant: "CloudTools", direction: "debit" as const },
  { id: "sample-2", timestamp: "2026-07-04T08:00:00Z", amount: -450, currency: "ZAR", description: "SaaS subscription", merchant: "CloudTools", direction: "debit" as const },
  { id: "sample-3", timestamp: "2026-07-08T08:00:00Z", amount: -180, currency: "ZAR", description: "Vendor service fee", merchant: "Supplier Co", direction: "debit" as const },
  { id: "sample-4", timestamp: "2026-07-12T08:00:00Z", amount: -180, currency: "ZAR", description: "Vendor service fee", merchant: "Supplier Co", direction: "debit" as const },
  { id: "sample-5", timestamp: "2026-07-15T14:00:00Z", amount: -899, currency: "ZAR", description: "Unused software seat", merchant: "TeamApp", direction: "debit" as const },
  { id: "sample-6", timestamp: "2026-07-20T09:00:00Z", amount: -220, currency: "ZAR", description: "Bank service fee", merchant: "Bank", direction: "debit" as const },
  { id: "sample-7", timestamp: "2026-07-25T10:00:00Z", amount: 45000, currency: "ZAR", description: "Customer payment", merchant: "Client Invoice", direction: "credit" as const },
];

const BAND_STYLES: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-500",
  yellow: "bg-amber-500/15 text-amber-500",
  red: "bg-red-500/15 text-red-500",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-500",
  high: "bg-red-500/15 text-red-500",
  red: "bg-red-500/15 text-red-500",
  medium: "bg-amber-500/15 text-amber-500",
  warning: "bg-amber-500/15 text-amber-500",
  yellow: "bg-amber-500/15 text-amber-500",
};

const DONUT_PALETTE = [
  "#8b5cf6", // violet-500
  "#0ea5e9", // sky-500
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#f43f5e", // rose-500
  "#06b6d4", // cyan-500
];

const METADATA_ONLY_DETECTORS = new Set(["InclusionScorer", "StakeholderMetrics", "DataSource"]);

function visibleLeaks(analysis: Analysis | undefined) {
  if (!analysis) return [];
  return analysis.money_leaks.filter((leak) => !METADATA_ONLY_DETECTORS.has(leak.detector ?? ""));
}

export default function BusinessOverviewPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningDemo, setRunningDemo] = useState(false);

  async function load() {
    try {
      setError(null);
      const [summaryData, analysesData, accountsData] = await Promise.all([
        apiClient.getBusinessSummary(),
        apiClient.getBusinessAnalyses(8),
        apiClient.listBusinessAccounts(),
      ]);
      setSummary(summaryData);
      setAnalyses(analysesData);
      setAccounts(accountsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your business dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runSampleAnalysis() {
    setRunningDemo(true);
    setError(null);
    try {
      await apiClient.analyzeBusiness(SAMPLE_TRANSACTIONS);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the sample analysis.");
    } finally {
      setRunningDemo(false);
    }
  }

  const businessName = user?.businessName?.trim() || "Your Business";
  const hasAnalysis = Boolean(summary && summary.financial_health_score !== null);
  const latestAnalysis = analyses[0];
  const score = summary?.financial_health_score ?? 0;
  const band = summary?.health_band ?? undefined;

  const trendPoints: TrendPoint[] = useMemo(
    () =>
      [...analyses]
        .reverse()
        .map((analysis) => ({
          label: new Date(analysis.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          value: analysis.financial_health_score,
        })),
    [analyses]
  );

  const donutSegments: DonutSegment[] = useMemo(() => {
    const leaks = visibleLeaks(latestAnalysis);
    const byCategory = new Map<string, number>();
    for (const leak of leaks) {
      const key = leak.title || leak.detector || "Other";
      byCategory.set(key, (byCategory.get(key) ?? 0) + Number(leak.estimated_monthly_cost ?? 0));
    }
    return [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], index) => ({
        label,
        value,
        color: DONUT_PALETTE[index % DONUT_PALETTE.length],
      }));
  }, [latestAnalysis]);

  const recentLeaks = useMemo(() => {
    const leaks = visibleLeaks(latestAnalysis);
    return [...leaks]
      .sort((a, b) => Number(b.estimated_monthly_cost ?? 0) - Number(a.estimated_monthly_cost ?? 0))
      .slice(0, 5);
  }, [latestAnalysis]);

  const accountsByBranch: TrendPoint[] = useMemo(() => {
    const byBranch = new Map<string, number>();
    for (const account of accounts) {
      const key = account.branch_label?.trim() || UNASSIGNED_BRANCH_LABEL;
      byBranch.set(key, (byBranch.get(key) ?? 0) + 1);
    }
    return [...byBranch.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [accounts]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Loading your business dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{businessName}</h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening across your business&apos;s accounts today.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column: stat cards, trend chart, recent leaks */}
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Leaks found</CardDescription>
                <Flame className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{hasAnalysis ? summary?.leaks_found : 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Potential monthly savings</CardDescription>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  R{hasAnalysis ? summary?.potential_monthly_savings.toFixed(2) : "0.00"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Business health score trend</CardTitle>
              <CardDescription>Your business's financial health score across recent analyses</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendBarChart
                points={trendPoints}
                domain={[0, 100]}
                valueLabel="Health score"
                formatValue={(value) => `${value} / 100`}
                emptyIcon={TrendingUp}
                emptyTitle="No history yet"
                emptyDescription="Run an analysis (or link and sync a business account) to start tracking your health score over time."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent leaks</CardTitle>
                <CardDescription>Vendor fees, unused subscriptions, and other recurring costs found across your business</CardDescription>
              </div>
              {hasAnalysis && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/business/leaks">View all</Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {recentLeaks.length === 0 ? (
                hasAnalysis ? (
                  <EmptyState
                    card={false}
                    tone="brand"
                    icon={ShieldCheck}
                    title="Nothing leaking"
                    description="Nice work -- we didn't find any money leaks across your business in the latest analysis."
                  />
                ) : (
                  <EmptyState
                    card={false}
                    icon={Sparkles}
                    title="No leaks yet"
                    description="Link a business account and sync it, or try a sample analysis to see how TracePay reads your transactions."
                    actionLabel="Try a sample analysis"
                    onAction={runningDemo ? undefined : runSampleAnalysis}
                  />
                )
              ) : (
                <div className="space-y-2">
                  {recentLeaks.map((leak, index) => {
                    const severityKey = (leak.severity ?? "").toLowerCase();
                    return (
                      <div
                        key={`${leak.title}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{leak.title ?? leak.detector ?? "Leak"}</p>
                          {leak.severity && (
                            <Badge className={`mt-1 ${SEVERITY_TONE[severityKey] ?? ""}`}>
                              {String(leak.severity).toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <p className="shrink-0 font-semibold text-red-500">
                          -R{Number(leak.estimated_monthly_cost ?? 0).toFixed(2)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: health score card, leak breakdown, CTA */}
        <div className="space-y-4">
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <CardHeader>
              <CardDescription className="text-primary-foreground/70">Business financial health</CardDescription>
              <CardTitle className="text-primary-foreground">
                {hasAnalysis
                  ? summary?.last_analyzed_at
                    ? `Last analyzed ${new Date(summary.last_analyzed_at).toLocaleDateString()}`
                    : "Not yet analyzed"
                  : "No analysis yet"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-5">
              <CircularProgress
                value={hasAnalysis ? score : 0}
                max={100}
                color="white"
                trackColor="rgba(255,255,255,0.25)"
                label={hasAnalysis ? String(score) : "--"}
                sublabel={hasAnalysis ? band?.toUpperCase() : "NO DATA"}
              />
              <div className="flex-1 space-y-2 text-sm text-primary-foreground/90">
                <div className="flex items-center justify-between">
                  <span>Linked accounts</span>
                  <span className="font-semibold">{summary?.linked_accounts_count ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Frozen items</span>
                  <span className="font-semibold">{summary?.frozen_items_count ?? 0}</span>
                </div>
                {band && <Badge className="bg-white/15 text-primary-foreground">{band.toUpperCase()}</Badge>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accounts by branch</CardTitle>
              <CardDescription>How your linked accounts are spread across branches</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendBarChart
                points={accountsByBranch}
                valueLabel="Accounts"
                formatValue={(value) => `${value} account${value === 1 ? "" : "s"}`}
                emptyIcon={Building2}
                emptyTitle="No accounts yet"
                emptyDescription="Link accounts and tag them with a branch to see the split here."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leak breakdown</CardTitle>
              <CardDescription>Where your business's money is leaking, by category</CardDescription>
            </CardHeader>
            <CardContent>
              <LeakBreakdownDonut segments={donutSegments} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{hasAnalysis ? "Add more data" : "Get started"}</CardTitle>
              <CardDescription>
                {hasAnalysis
                  ? "Link another business account or re-run the sample to refresh your numbers."
                  : "Link a business account and sync it, or try a sample analysis to see how TracePay reads your transactions."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/business/accounts">
                  <Landmark className="mr-2 h-4 w-4" />
                  Link an account
                </Link>
              </Button>
              <Button variant="outline" onClick={runSampleAnalysis} disabled={runningDemo}>
                <Sparkles className="mr-2 h-4 w-4" />
                {runningDemo ? "Running..." : "Try a sample analysis"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
