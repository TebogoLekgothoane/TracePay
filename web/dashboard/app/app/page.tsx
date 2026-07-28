"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Flame, Landmark, Sparkles, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api";

type Summary = Awaited<ReturnType<typeof apiClient.getMySummary>>;

// A small, clearly-labeled sample dataset so a new account can see the
// pipeline work end to end without needing a real linked bank/MoMo sync
// (Open Banking sandbox credentials aren't configured in this environment).
const SAMPLE_TRANSACTIONS = [
  { id: "sample-1", timestamp: "2026-07-01T08:00:00Z", amount: -30, currency: "ZAR", description: "Airtime top-up", merchant: "MTN", direction: "debit" as const },
  { id: "sample-2", timestamp: "2026-07-04T08:00:00Z", amount: -30, currency: "ZAR", description: "Airtime top-up", merchant: "MTN", direction: "debit" as const },
  { id: "sample-3", timestamp: "2026-07-08T08:00:00Z", amount: -30, currency: "ZAR", description: "Airtime top-up", merchant: "MTN", direction: "debit" as const },
  { id: "sample-4", timestamp: "2026-07-12T08:00:00Z", amount: -30, currency: "ZAR", description: "Airtime top-up", merchant: "MTN", direction: "debit" as const },
  { id: "sample-5", timestamp: "2026-07-15T14:00:00Z", amount: -149, currency: "ZAR", description: "Monthly streaming subscription", merchant: "StreamCo", direction: "debit" as const },
  { id: "sample-6", timestamp: "2026-07-20T09:00:00Z", amount: -92, currency: "ZAR", description: "ATM cash-out fee", merchant: "ATM", direction: "debit" as const },
  { id: "sample-7", timestamp: "2026-07-25T10:00:00Z", amount: 8500, currency: "ZAR", description: "Salary", merchant: "Employer", direction: "credit" as const },
];

const BAND_STYLES: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-500",
  yellow: "bg-amber-500/15 text-amber-500",
  red: "bg-red-500/15 text-red-500",
};

export default function PersonalOverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningDemo, setRunningDemo] = useState(false);

  async function load() {
    try {
      setError(null);
      const data = await apiClient.getMySummary();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your summary.");
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
      await apiClient.analyzeMine(SAMPLE_TRANSACTIONS);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the sample analysis.");
    } finally {
      setRunningDemo(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading your health score...</div>;
  }

  const hasAnalysis = summary && summary.financial_health_score !== null;
  const bandClass = summary?.health_band ? BAND_STYLES[summary.health_band] ?? "" : "";

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your Financial Health</h1>
        <p className="text-sm text-muted-foreground">
          Traced from your linked accounts. Read-only, nothing moves without you.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!hasAnalysis ? (
        <Card>
          <CardHeader>
            <CardTitle>No analysis yet</CardTitle>
            <CardDescription>
              Link an account and sync it, or try a sample analysis to see how TracePay reads your
              transactions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/app/accounts">Link an account</Link>
            </Button>
            <Button variant="outline" onClick={runSampleAnalysis} disabled={runningDemo}>
              <Sparkles className="mr-2 h-4 w-4" />
              {runningDemo ? "Running sample analysis..." : "Try a sample analysis"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Financial Health Score</CardTitle>
                <CardDescription>
                  {summary?.last_analyzed_at
                    ? `Last analyzed ${new Date(summary.last_analyzed_at).toLocaleDateString()}`
                    : "Not yet analyzed"}
                </CardDescription>
              </div>
              {summary?.health_band && (
                <Badge className={bandClass}>{summary.health_band.toUpperCase()}</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight">
                  {summary?.financial_health_score}
                </span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              <Progress value={summary?.financial_health_score ?? 0} />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Leaks found</CardDescription>
                <Flame className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{summary?.leaks_found}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Potential monthly savings</CardDescription>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  R{summary?.potential_monthly_savings.toFixed(2)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Linked accounts</CardDescription>
                <Landmark className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{summary?.linked_accounts_count}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/app/leaks">View leaks</Link>
            </Button>
            <Button variant="outline" onClick={runSampleAnalysis} disabled={runningDemo}>
              <Sparkles className="mr-2 h-4 w-4" />
              {runningDemo ? "Running..." : "Run sample analysis again"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
